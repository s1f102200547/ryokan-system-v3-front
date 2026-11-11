import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { setNowJST } from '@tests/utils/timeHelper'
import { POST } from '@/app/api/auth/login/route'
import { InfraError } from '@/types/errors'

// パスワードの確認（Firebase の REST）はモック。失敗回数の記録はメモリで数える（判定は本物の domain）
vi.mock('@/infra/auth/passwordSignIn', () => ({ signInWithPassword: vi.fn(), isPasswordSignInConfigured: vi.fn() }))
import { isPasswordSignInConfigured, signInWithPassword } from '@/infra/auth/passwordSignIn'
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const mockSignIn = vi.mocked(signInWithPassword)

// adminAuth の verifyIdToken / createSessionCookie をモック
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
    createSessionCookie: vi.fn(),
  },
  adminDb: {},
}))
import { adminAuth } from '@/lib/firebase/admin'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { logger } from '@/lib/logger'
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const mockVerifyIdToken = vi.mocked(adminAuth.verifyIdToken)
const mockCreateSessionCookie = vi.mocked(adminAuth.createSessionCookie)
const mockGetUser = vi.mocked(adminAuth.getUser)
const mockSetCustomUserClaims = vi.mocked(adminAuth.setCustomUserClaims)

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const PASSWORD = 'pw-must-not-leak-7c1e'
const VALID = { email: 'pc1@example.com', password: PASSWORD }

// 既定は旅館の PC の Chrome（ログインは Windows の Chrome・Edge だけ）と、正しい形の body
function makeRequest(body: object = VALID, userAgent: string | null = CHROME_WIN) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(userAgent === null ? {} : { 'user-agent': userAgent }) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    throttle.clear()
    mockSignIn.mockResolvedValue({ success: true, value: { idToken: 'id-token-from-rest' } })
    vi.mocked(isPasswordSignInConfigured).mockReturnValue(true)
    mockGetUser.mockResolvedValue({ customClaims: undefined } as never)
    mockSetCustomUserClaims.mockResolvedValue(undefined)
  })

  it('正しいメールアドレスとパスワードなら 200 と session Cookie を返す（REST で得たトークンから Cookie を作る）', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value')

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(response.headers.get('set-cookie')).toContain('session=')
  })

  // Secure（HTTPS のときだけ送る）は本番だけで付ける。ローカルの HTTP では動きを確かめられないので、付く条件だけを見る
  describe('Cookie の Secure', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.useRealTimers()
    })

    async function loginCookie(): Promise<string> {
      mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
      mockCreateSessionCookie.mockResolvedValue('session-cookie-value')
      const response = await POST(makeRequest())
      expect(response.status).toBe(200)
      return response.headers.get('set-cookie') ?? ''
    }

    it('production では Secure を付ける', async () => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T12:00') // 本番は時間外のログインを断るので、営業時間内にする
      vi.stubEnv('NODE_ENV', 'production')
      expect(await loginCookie()).toMatch(/;\s*Secure(;|$)/i)
    })

    it('development / test では付けない（HTTP の開発サーバーで Cookie が送られなくなるため）', async () => {
      expect(await loginCookie()).not.toMatch(/;\s*Secure(;|$)/i)
    })
  })

  // 400 は Firebase に送らず、失敗としても数えない
  it.each([
    ['空の object', {}],
    ['パスワードなし', { email: 'pc1@example.com' }],
    ['メールアドレスが空', { email: '', password: 'xxx' }],
    ['パスワードが空', { email: 'pc1@example.com', password: '' }],
    ['パスワードが2文字', { email: 'pc1@example.com', password: 'ab' }],
    ['@ がない', { email: 'pc1.example.com', password: 'xxx' }],
    ['@ の前がない', { email: '@example.com', password: 'xxx' }],
    ['@ の後がない', { email: 'pc1@', password: 'xxx' }],
    ['@ が2つ', { email: 'pc1@@example.com', password: 'xxx' }],
    ['空白を含む', { email: 'pc 1@example.com', password: 'xxx' }],
    ['前後の空白', { email: ' pc1@example.com', password: 'xxx' }],
    ['メールアドレスが長すぎる（255文字）', { email: `${'a'.repeat(243)}@example.com`, password: 'xxx' }],
    ['パスワードが長すぎる（257文字）', { email: 'pc1@example.com', password: 'p'.repeat(257) }],
    ['文字列でない', { email: 1, password: true }],
    ['以前の形（idToken）', { idToken: 'token' }],
  ])('%s は 400（Firebase に送らず、数えない）', async (_label, body) => {
    const response = await POST(makeRequest(body))
    expect(response.status).toBe(400)
    expect(mockSignIn).not.toHaveBeenCalled()
    expect(throttle.states.size).toBe(0)
  })

  it.each([
    ['いちばん短い形（3文字）', 'a@b'],
    ['ドメインに点なし（ブラウザの type="email" と同じく通す）', 'pc1@localhost'],
    ['+ を含む', 'pc1+front@example.com'],
  ])('メールアドレスの形として通す: %s', async (_label, email) => {
    expect((await POST(makeRequest({ email, password: 'abc' }))).status).toBe(200)
  })

  it('パスワードは3文字から通す', async () => {
    expect((await POST(makeRequest({ email: 'pc1@example.com', password: 'abc' }))).status).toBe(200)
  })

  it('長さの上限ちょうど（メールアドレス254文字・パスワード256文字）は通す', async () => {
    const response = await POST(makeRequest({ email: `${'a'.repeat(242)}@example.com`, password: 'p'.repeat(256) }))
    expect(response.status).toBe(200)
  })

  it('verifyIdToken が認証失敗コードを返した場合 401 を返す', async () => {
    // CREDENTIAL_ERROR_CODES に含まれる code を持つエラー（Firebase Admin が実際に throw する形式）
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('invalid_credentials')
  })

  it('verifyIdToken がインフラ障害（認証失敗コード以外）の場合 503 を返す', async () => {
    // CREDENTIAL_ERROR_CODES に含まれない code → インフラ障害扱い
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/internal-error', message: 'Firebase down' })

    const response = await POST(makeRequest())

    expect(response.status).toBe(503)
  })

  it('createSessionCookie が失敗した場合 503 を返す', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
    mockCreateSessionCookie.mockRejectedValue(new Error('Firebase Auth down'))

    const response = await POST(makeRequest())

    expect(response.status).toBe(503)
  })

  // request.json() を catch しておらず 500 になっていた
  it.each([
    ['不正な JSON', '{"email":'],
    ['空の body', ''],
  ])('%s で 400（Slack に通知しない）', async (_label, raw) => {
    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    }))
    expect(response.status).toBe(400)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  // 形式が不正な idToken で 503 + ALERT になっていた。
  // firebase-admin は不正なトークンにも公開鍵の取得失敗にも auth/argument-error を返すため、メッセージで分ける
  // （メッセージは firebase-admin 14.5 が実際に返すもの）
  it.each([
    ['形式が不正', 'Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token.'],
    ['クレームが不正', 'Firebase ID token has incorrect "aud" (audience) claim. Expected "demo-x" but got "other".'],
    ['署名が不正', 'Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/admin/verify-id-tokens'],
  ])('auth/argument-error（%s）は 401（Slack に通知しない）', async (_label, message) => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message })
    const response = await POST(makeRequest())
    expect(response.status).toBe(401)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  it.each([
    ['HTTP エラー', 'Error fetching public keys for Google certs: 500'],
    ['接続できない', 'connect ETIMEDOUT 142.250.0.1:443'],
  ])('auth/argument-error でも公開鍵の取得失敗（%s）は 503 + Slack 通知', async (_label, message) => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message })
    const response = await POST(makeRequest())
    expect(response.status).toBe(503)
    expect(notifySlackFireAndForget).toHaveBeenCalled()
  })

  // ログイン成功は毎回 Slack に通知する（旅館の外からのログインに気付くため）
  it('ログイン成功で、アカウント・IP・ブラウザを Slack に通知する', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value')

    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '<!channel>, 203.0.113.5',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      },
      body: JSON.stringify(VALID),
    }))

    expect(response.status).toBe(200)
    expect(notifySlackFireAndForget).toHaveBeenCalledTimes(1)
    const message = vi.mocked(notifySlackFireAndForget).mock.calls[0][0]
    expect(message).toContain('pc1@example.com')
    expect(message).toContain('IP ?, 203.0.113.5')
    expect(message).toContain('Edge on Windows')
    expect(message).not.toContain('<!channel>')
  })

  it('ログインに失敗したときは成功の通知をしない', async () => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })
    await POST(makeRequest())
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  // 旅館の PC（Windows）の Chrome・Edge だけ。パスワードが合っていても、それ以外には Cookie を発行しない
  describe('端末・ブラウザの確認', () => {
    beforeEach(() => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
      mockCreateSessionCookie.mockResolvedValue('session-cookie-value')
    })

    it.each([
      ['Windows の Chrome', CHROME_WIN],
      ['Windows の Edge', `${CHROME_WIN} Edg/141.0.0.0`],
    ])('%s は 200', async (_label, ua) => {
      expect((await POST(makeRequest(VALID, ua))).status).toBe(200)
    })

    it.each([
      ['Mac の Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Windows 以外の端末'],
      ['Android の Chrome', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Windows 以外の端末'],
      ['Windows の Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Chrome・Edge 以外のブラウザ'],
      ['Windows の Opera', `${CHROME_WIN} OPR/120.0.0.0`, 'Chrome・Edge 以外のブラウザ'],
      ['Windows の HeadlessChrome', CHROME_WIN.replace('Chrome/', 'HeadlessChrome/'), 'Chrome・Edge 以外のブラウザ'],
      ['User-Agent なし', null, 'Windows 以外の端末'],
    ])('%s は 403 client_not_allowed、Cookie なし、Slack に拒否を通知', async (_label, ua, reasonLabel) => {
      const response = await POST(makeRequest(VALID, ua))
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'client_not_allowed' })
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(mockCreateSessionCookie).not.toHaveBeenCalled()
      expect(notifySlackFireAndForget).toHaveBeenCalledTimes(1)
      const message = vi.mocked(notifySlackFireAndForget).mock.calls[0][0]
      expect(message).toMatch(/^\[ログイン拒否\] pc1@example\.com \/ /)
      expect(message).toContain(reasonLabel)
    })

    it('拒否の通知に、生の User-Agent と X-Forwarded-For の書式を載せない', async () => {
      const response = await POST(new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user-agent': '<!channel> Mozilla/5.0 (X11; Linux x86_64)', 'x-forwarded-for': '<!here>, 203.0.113.5' },
        body: JSON.stringify(VALID),
      }))
      expect(response.status).toBe(403)
      const message = vi.mocked(notifySlackFireAndForget).mock.calls[0][0]
      expect(message).not.toContain('<!')
      expect(message).toContain('IP ?, 203.0.113.5')
      expect(message).toContain('その他のブラウザ on Linux')
    })

    it('トークンが不正なら、User-Agent に関係なく 401（拒否の通知はしない）', async () => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })
      expect((await POST(makeRequest(VALID, null))).status).toBe(401)
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    })

    it('どんな User-Agent でも 200 か 403（5xx にならない）', async () => {
      await fc.assert(fc.asyncProperty(fc.string({ maxLength: 300 }), async (ua) => {
        const status = (await POST(makeRequest(VALID, ua))).status
        expect([200, 403]).toContain(status)
      }), { numRuns: 100 })
    })
  })

  // 1アカウント1セッション。最後のログインの時刻をユーザーのクレームに書き、verifySession が Cookie の時刻と比べる
  describe('1アカウント1セッション', () => {
    const AUTH_TIME = 1_700_000_000
    afterEach(() => vi.useRealTimers())

    beforeEach(() => {
      mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com', auth_time: AUTH_TIME } as never)
      mockCreateSessionCookie.mockResolvedValue('session-cookie-value')
    })

    it('今回のログインの時刻を、ほかのクレームを残したまま書いてから Cookie を作る', async () => {
      mockGetUser.mockResolvedValue({ customClaims: { other: 'keep', sessionAuthTime: 1 } } as never)
      expect((await POST(makeRequest())).status).toBe(200)
      expect(mockGetUser).toHaveBeenCalledWith('uid-1')
      expect(mockSetCustomUserClaims).toHaveBeenCalledWith('uid-1', { other: 'keep', sessionAuthTime: AUTH_TIME })
      expect(mockSetCustomUserClaims.mock.invocationCallOrder[0]).toBeLessThan(mockCreateSessionCookie.mock.invocationCallOrder[0])
    })

    it.each([
      ['ユーザーが読めない', () => mockGetUser.mockRejectedValue(new Error('Auth down'))],
      ['クレームが書けない', () => mockSetCustomUserClaims.mockRejectedValue(new Error('Auth down'))],
    ])('%s なら 503 で Cookie を返さない（Slack に通知）', async (_label, fail) => {
      fail()
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(mockCreateSessionCookie).not.toHaveBeenCalled()
      expect(vi.mocked(notifySlackFireAndForget).mock.calls[0][0]).toMatch(/^\[ALERT\]/)
    })

    // 断ったログインでクレームを書くと、正しいスタッフのセッションが切れてしまう
    it.each([
      ['端末・ブラウザで断った', () => makeRequest(VALID, null)],
      ['トークンが不正', () => { mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'x' }); return makeRequest() }],
    ])('%s ときはクレームを書かない', async (_label, request) => {
      await POST(request())
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled()
    })

    describe('前のセッションを切ったことの通知', () => {
      const jstSeconds = (iso: string) => Date.parse(`${iso}+09:00`) / 1000
      const NOW_AUTH_TIME = jstSeconds('2026-05-20T11:59:00')

      beforeEach(() => {
        vi.useFakeTimers()
        setNowJST('2026-05-20T12:00')
        mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com', auth_time: NOW_AUTH_TIME } as never)
      })
      async function notice(previous: unknown): Promise<string> {
        mockGetUser.mockResolvedValue({ customClaims: previous === undefined ? undefined : { sessionAuthTime: previous } } as never)
        expect((await POST(makeRequest())).status).toBe(200)
        return vi.mocked(notifySlackFireAndForget).mock.calls[0][0]
      }

      it('前のログインが今日（JST）なら「前のセッションを切った」', async () => {
        expect(await notice(jstSeconds('2026-05-20T00:30:00'))).toMatch(/ \/ 前のセッションを切った$/)
      })

      it.each([
        ['前のログインがない', undefined],
        ['前のログインが昨日（23:00 に切れている）', jstSeconds('2026-05-19T22:59:00')],
        ['同じログインのトークンで2回目（同じ時刻）', NOW_AUTH_TIME],
        ['壊れた値', 'x'],
        ['Date にできない値', 1e300],
      ])('%s なら書かない', async (_label, previous) => {
        expect(await notice(previous)).not.toContain('前のセッションを切った')
      })
    })
  })

  // パスワードはサーバーが Firebase の REST で確かめる。失敗が続いたメールアドレス・IP は iPhone のように長く止める
  describe('パスワードの確認と、失敗回数の制限', () => {
    const MIN = 60
    const wrong = () => mockSignIn.mockResolvedValue({ success: false, error: 'invalid_credentials' })
    const from = (ip: string, body: object = VALID) => new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': CHROME_WIN, 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    })
    const slackMessages = () => vi.mocked(notifySlackFireAndForget).mock.calls.map((c) => c[0])

    beforeEach(() => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T10:00')
      mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com', auth_time: 1 } as never)
      mockCreateSessionCookie.mockResolvedValue('session-cookie-value')
    })
    afterEach(() => vi.useRealTimers())

    it('メールアドレスとパスワードを REST に渡し、得たトークンで Cookie を作る', async () => {
      expect((await POST(makeRequest())).status).toBe(200)
      expect(mockSignIn).toHaveBeenCalledWith('pc1@example.com', PASSWORD)
      expect(mockVerifyIdToken).toHaveBeenCalledWith('id-token-from-rest')
      expect(mockCreateSessionCookie).toHaveBeenCalledWith('id-token-from-rest', expect.anything())
    })

    it('違えば 401。Cookie を作らず、失敗を1回数える（2回までは止めない・知らせない）', async () => {
      wrong()
      for (let i = 0; i < 2; i++) {
        const response = await POST(from('203.0.113.5'))
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'invalid_credentials' })
      }
      expect(mockVerifyIdToken).not.toHaveBeenCalled()
      expect(mockCreateSessionCookie).not.toHaveBeenCalled()
      expect(slackMessages()).toEqual([])
    })

    it('3回目の失敗で、メールアドレスと IP の両方を1分止め、Slack に知らせる。止めている間は REST に送らず 429', async () => {
      wrong()
      for (let i = 0; i < 3; i++) expect((await POST(from('203.0.113.5'))).status).toBe(401)
      expect(slackMessages()).toEqual([
        '[ログイン制限] アカウント pc1@example.com / 3回続けて失敗 / 1分止める',
        '[ログイン制限] IP 203.0.113.5 / 3回続けて失敗 / 1分止める',
      ])

      mockSignIn.mockClear()
      mockSignIn.mockResolvedValue({ success: true, value: { idToken: 'id-token-from-rest' } }) // 正しいパスワードでも
      const response = await POST(from('203.0.113.5'))
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ error: 'too_many_attempts', retryAfterSeconds: 1 * MIN })
      expect(response.headers.get('retry-after')).toBe('60')
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(mockSignIn).not.toHaveBeenCalled()
    })

    it('止めている間の試行は数えない（押すたびに延びない）。切れたら試せる', async () => {
      wrong()
      for (let i = 0; i < 3; i++) await POST(from('203.0.113.5'))
      for (let i = 0; i < 5; i++) expect((await POST(from('203.0.113.5'))).status).toBe(429)
      vi.advanceTimersByTime(30_000)
      expect(await (await POST(from('203.0.113.5'))).json()).toEqual({ error: 'too_many_attempts', retryAfterSeconds: 30 })

      vi.advanceTimersByTime(30_000)
      mockSignIn.mockClear()
      expect((await POST(from('203.0.113.5'))).status).toBe(401) // 4回目の失敗
      expect(mockSignIn).toHaveBeenCalledTimes(1)
      expect(slackMessages().at(-2)).toBe('[ログイン制限] アカウント pc1@example.com / 4回続けて失敗 / 5分止める')
    })

    it('成功すると、メールアドレスと IP の回数を 0 に戻す', async () => {
      wrong()
      for (let i = 0; i < 2; i++) await POST(from('203.0.113.5'))
      mockSignIn.mockResolvedValue({ success: true, value: { idToken: 'id-token-from-rest' } })
      expect((await POST(from('203.0.113.5'))).status).toBe(200)
      expect(throttle.states.size).toBe(0)
    })

    it('IP ごとにも数える: 同じ IP から別のアドレスを順に試しても、3回で止まる', async () => {
      wrong()
      for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
        expect((await POST(from('203.0.113.5', { email, password: 'xxx' }))).status).toBe(401)
      }
      expect((await POST(from('203.0.113.5', { email: 'd@example.com', password: 'xxx' }))).status).toBe(429)
      expect((await POST(from('198.51.100.7', { email: 'd@example.com', password: 'xxx' }))).status).toBe(401) // 別の IP なら試せる
    })

    it('メールアドレスごとにも数える: IP を変えても、大文字にしても止まる', async () => {
      wrong()
      for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) await POST(from(ip))
      expect((await POST(from('198.51.100.4', { email: 'PC1@Example.com', password: 'xxx' }))).status).toBe(429)
    })

    it('IP は X-Forwarded-For の右端（Google が書いた値）。左側を毎回変えても同じ IP として数える', async () => {
      wrong()
      for (let i = 0; i < 3; i++) await POST(from(`10.0.0.${i}, 203.0.113.5`, { email: `user${i}@example.com`, password: 'xxx' }))
      expect((await POST(from('10.9.9.9, 203.0.113.5', { email: 'other@example.com', password: 'xxx' }))).status).toBe(429)
    })

    it('X-Forwarded-For がなければ、まとめて1つの IP（unknown）として数える', async () => {
      wrong()
      for (let i = 0; i < 3; i++) await POST(makeRequest({ email: `user${i}@example.com`, password: 'xxx' }))
      expect((await POST(makeRequest({ email: 'other@example.com', password: 'xxx' }))).status).toBe(429)
      expect(slackMessages()).toContain('[ログイン制限] IP ? / 3回続けて失敗 / 1分止める')
    })

    it('端末・ブラウザで断ったとき（パスワードは合っている）は数えない', async () => {
      for (let i = 0; i < 3; i++) expect((await POST(makeRequest(VALID, null))).status).toBe(403)
      expect((await POST(makeRequest())).status).toBe(200)
    })

    it.each([
      ['パスワードの確認', () => mockSignIn.mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'Password sign-in failed: TOO_MANY_ATTEMPTS_TRY_LATER (status 400)'))],
      ['回数の読み取り', () => vi.spyOn(throttle, 'read').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))],
    ])('%s の障害は 503 と Slack の ALERT（数えない）', async (_label, fail) => {
      fail()
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(slackMessages()[0]).toMatch(/^\[ALERT\] ログインエラー/)
      expect(throttle.states.size).toBe(0)
    })

    it('API キーが設定されていなければ、回数を読まずにすぐ 503（CI の ZAP・本番の設定忘れ）', async () => {
      vi.mocked(isPasswordSignInConfigured).mockReturnValue(false)
      const read = vi.spyOn(throttle, 'read')
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(read).not.toHaveBeenCalled()
      expect(mockSignIn).not.toHaveBeenCalled()
      expect(slackMessages()[0]).toMatch(/^\[ALERT\] ログインエラー\(AUTH_UNAVAILABLE\)/)
    })

    it('パスワードは、ログにも Slack にも出ない', async () => {
      wrong()
      for (let i = 0; i < 4; i++) await POST(from('203.0.113.5'))
      mockSignIn.mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'x'))
      vi.advanceTimersByTime(60 * 60 * 1000)
      await POST(from('203.0.113.5'))
      const everything = JSON.stringify([
        vi.mocked(logger.info).mock.calls, vi.mocked(logger.warn).mock.calls, vi.mocked(logger.error).mock.calls,
        vi.mocked(notifySlackFireAndForget).mock.calls,
      ])
      expect(everything).not.toContain(PASSWORD)
      expect(vi.mocked(logger.warn).mock.calls.length).toBeGreaterThan(0) // 何も出ていないから通った、ではない
    })
  })
})

