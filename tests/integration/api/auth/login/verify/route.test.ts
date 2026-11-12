import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { setNowJST } from '@tests/utils/timeHelper'
import { POST } from '@/app/api/auth/login/verify/route'
import { InfraError } from '@/types/errors'
import { MFA_PENDING_TTL_MS } from '@/constants/auth'

// ログインの2段目（SMS のコード → Session Cookie）。1段目は ../route.test.ts。
// コードの確認（Firebase の REST）はモック。失敗回数と途中の状態はメモリ（判定は本物の domain）
vi.mock('@/infra/auth/mfaSignIn', () => ({ startPhoneMfa: vi.fn(), finalizePhoneMfa: vi.fn() }))
import { finalizePhoneMfa } from '@/infra/auth/mfaSignIn'
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/infra/auth/firestoreMfaPendingRepository', async () => {
  const { createMemoryMfaPendingRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreMfaPendingRepository: createMemoryMfaPendingRepository() }
})
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
import type { createMemoryMfaPendingRepository } from '@tests/utils/memoryMfaRepositories'

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn(), getUser: vi.fn(), setCustomUserClaims: vi.fn(), createSessionCookie: vi.fn() },
  adminDb: {},
}))
import { adminAuth } from '@/lib/firebase/admin'
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { logger } from '@/lib/logger'
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>
const mockFinalize = vi.mocked(finalizePhoneMfa)
const mockVerifyIdToken = vi.mocked(adminAuth.verifyIdToken)
const mockCreateSessionCookie = vi.mocked(adminAuth.createSessionCookie)
const mockGetUser = vi.mocked(adminAuth.getUser)
const mockSetCustomUserClaims = vi.mocked(adminAuth.setCustomUserClaims)

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const IP = '203.0.113.5'
const PENDING_ID = 'pending-id-from-cookie'
const SECRETS = ['pending-cred-must-not-leak', 'session-info-must-not-leak', '913274']
const CODE = '913274'
const AUTH_TIME = 1_700_000_000
const DECODED = { uid: 'uid-1', email: 'pc1@example.com', auth_time: AUTH_TIME, firebase: { sign_in_second_factor: 'phone' } }

type RequestOptions = { body?: unknown; userAgent?: string | null; cookie?: string | null; forwardedFor?: string | null }
function makeRequest({ body = { code: CODE }, userAgent = CHROME_WIN, cookie = `mfa_pending=${PENDING_ID}`, forwardedFor = IP }: RequestOptions = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (userAgent !== null) headers['user-agent'] = userAgent
  if (cookie !== null) headers.cookie = cookie
  if (forwardedFor !== null) headers['x-forwarded-for'] = forwardedFor
  return new Request('http://localhost/api/auth/login/verify', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}

// 1段目（パスワード → SMS）が終わった状態
async function seedPending(overrides: { ip?: string | null; expiresAtMs?: number } = {}) {
  await pendings.save(PENDING_ID, {
    email: 'pc1@example.com', ip: overrides.ip === undefined ? IP : overrides.ip,
    mfaPendingCredential: SECRETS[0], sessionInfo: SECRETS[1], phoneHint: '+81*******1234',
    expiresAtMs: overrides.expiresAtMs ?? Date.now() + MFA_PENDING_TTL_MS,
  })
}
const slackMessages = () => vi.mocked(notifySlackFireAndForget).mock.calls.map((c) => c[0])
const wrongCode = () => mockFinalize.mockResolvedValue({ success: false, error: { kind: 'invalid_code', code: 'INVALID_CODE' } })

describe('POST /api/auth/login/verify', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    throttle.clear(); pendings.clear()
    await seedPending()
    mockFinalize.mockResolvedValue({ success: true, value: { idToken: 'id-token-mfa' } })
    mockVerifyIdToken.mockResolvedValue(DECODED as never)
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value')
    mockGetUser.mockResolvedValue({ customClaims: undefined } as never)
    mockSetCustomUserClaims.mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('正しいコードなら 200 と session Cookie。途中の状態の Cookie と保存は消す', async () => {
    const response = await POST(makeRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mockFinalize).toHaveBeenCalledWith(SECRETS[0], SECRETS[1], CODE)
    expect(mockVerifyIdToken).toHaveBeenCalledWith('id-token-mfa')
    expect(mockCreateSessionCookie).toHaveBeenCalledWith('id-token-mfa', expect.anything())
    expect(response.cookies.get('session')?.value).toBe('session-cookie-value')
    expect(response.headers.get('set-cookie')).toMatch(/mfa_pending=;.*Max-Age=0/i)
    expect(pendings.items.size).toBe(0)
  })

  describe('Cookie の Secure', () => {
    it('production では Secure を付ける', async () => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T12:00') // 本番は時間外を断るので、営業時間内にする
      vi.stubEnv('NODE_ENV', 'production')
      await seedPending()
      const response = await POST(makeRequest())
      expect(response.status).toBe(200)
      expect(response.cookies.get('session')?.secure).toBe(true)
    })
    it('development / test では付けない（HTTP の開発サーバーで Cookie が送られなくなるため）', async () => {
      const response = await POST(makeRequest())
      expect(response.status).toBe(200)
      expect(response.cookies.get('session')?.secure).toBeFalsy()
    })
  })

  it('本番の時間外は 403（コードを確かめない）', async () => {
    vi.useFakeTimers()
    setNowJST('2026-05-20T23:30')
    vi.stubEnv('NODE_ENV', 'production')
    expect((await POST(makeRequest())).status).toBe(403)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it.each([
    ['空の object', {}],
    ['5桁', { code: '12345' }],
    ['7桁', { code: '1234567' }],
    ['数字以外', { code: 'abcdef' }],
    ['全角の数字', { code: '１２３４５６' }],
    ['前後の空白', { code: ' 123456' }],
    ['数値', { code: 123456 }],
    ['不正な JSON', '{"code":'],
    ['空の body', ''],
  ])('%s は 400（Firebase に送らず、数えない）', async (_label, body) => {
    const response = await POST(makeRequest({ body }))
    expect(response.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
    expect(throttle.states.size).toBe(0)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  describe('途中の状態', () => {
    it.each([
      ['Cookie がない', null],
      ['知らない ID', 'mfa_pending=unknown'],
      ['別の名前の Cookie だけ', 'session=x'],
    ])('%s は 401 mfa_expired（Firebase に送らない）', async (_label, cookie) => {
      const response = await POST(makeRequest({ cookie }))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'mfa_expired' })
      expect(mockFinalize).not.toHaveBeenCalled()
      expect(response.cookies.get('session')).toBeUndefined()
    })

    it('5分を過ぎたら 401 mfa_expired、途中の状態を消す', async () => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T10:00')
      await seedPending()
      vi.advanceTimersByTime(MFA_PENDING_TTL_MS)
      expect(await (await POST(makeRequest())).json()).toEqual({ error: 'mfa_expired' })
      expect(pendings.items.size).toBe(0)
    })

    it('パスワードを確かめたときと接続元が違えば 401 mfa_expired、途中の状態を消し、Slack に拒否', async () => {
      const response = await POST(makeRequest({ forwardedFor: '198.51.100.9' }))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'mfa_expired' })
      expect(mockFinalize).not.toHaveBeenCalled()
      expect(pendings.items.size).toBe(0)
      expect(slackMessages()[0]).toMatch(/^\[ログイン拒否\] （不明） \/ パスワードと SMS のコードで接続元が違う \/ IP 198\.51\.100\.9/)
    })

    it('X-Forwarded-For の右端で比べる（左側は利用者が書ける）', async () => {
      expect((await POST(makeRequest({ forwardedFor: `10.0.0.1, ${IP}` }))).status).toBe(200)
    })

    it('Firebase がコードの期限切れを返したら 401 mfa_expired（数えない）', async () => {
      mockFinalize.mockResolvedValue({ success: false, error: { kind: 'expired', code: 'SESSION_EXPIRED' } })
      expect(await (await POST(makeRequest())).json()).toEqual({ error: 'mfa_expired' })
      expect(throttle.states.size).toBe(0)
      expect(pendings.items.size).toBe(0)
    })
  })

  describe('コードの誤りと、失敗回数の制限', () => {
    beforeEach(async () => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T10:00')
      await seedPending()
    })

    it('違えば 401 invalid_code。途中の状態は残り、打ち直せる', async () => {
      wrongCode()
      const response = await POST(makeRequest())
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'invalid_code' })
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(pendings.items.size).toBe(1)

      mockFinalize.mockResolvedValue({ success: true, value: { idToken: 'id-token-mfa' } })
      expect((await POST(makeRequest())).status).toBe(200)
    })

    it('3回目の誤りで、メールアドレスと IP を1分止め、Slack に知らせる。止めている間は Firebase に送らず 429', async () => {
      wrongCode()
      for (let i = 0; i < 3; i++) expect((await POST(makeRequest())).status).toBe(401)
      expect(slackMessages()).toEqual([
        '[ログイン制限] アカウント pc1@example.com / 3回続けて失敗 / 1分止める',
        '[ログイン制限] IP 203.0.113.5 / 3回続けて失敗 / 1分止める',
      ])
      mockFinalize.mockClear()
      mockFinalize.mockResolvedValue({ success: true, value: { idToken: 'id-token-mfa' } }) // 正しいコードでも
      const response = await POST(makeRequest())
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ error: 'too_many_attempts', retryAfterSeconds: 60 })
      expect(response.headers.get('retry-after')).toBe('60')
      expect(mockFinalize).not.toHaveBeenCalled()
    })

    it('正しいコードで、メールアドレスと IP の回数を 0 に戻す', async () => {
      wrongCode()
      for (let i = 0; i < 2; i++) await POST(makeRequest())
      mockFinalize.mockResolvedValue({ success: true, value: { idToken: 'id-token-mfa' } })
      expect((await POST(makeRequest())).status).toBe(200)
      expect(throttle.states.size).toBe(0)
    })

    it('Firebase 自身が止めたら、失敗として数えて 429', async () => {
      mockFinalize.mockResolvedValue({ success: false, error: { kind: 'throttled', code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
      const response = await POST(makeRequest())
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ error: 'too_many_attempts', retryAfterSeconds: 60 })
      expect(slackMessages().filter((m) => m.startsWith('[ALERT]'))).toEqual([])
    })

    it.each([
      ['コードの確認', () => mockFinalize.mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in finalize failed: INTERNAL_ERROR (status 500)'))],
      ['途中の状態の読み取り', () => vi.spyOn(pendings, 'get').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))],
      ['回数の確認と記録', () => vi.spyOn(throttle, 'acquire').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))],
    ])('%s の障害は 503 と Slack の ALERT（数えない）', async (_label, fail) => {
      fail()
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(slackMessages()[0]).toMatch(/^\[ALERT\] ログイン（SMS のコード）エラー/)
      expect(throttle.states.size).toBe(0)
    })
  })

  describe('ID トークンの確認', () => {
    it('2要素目を通っていないトークンは 403 no_second_factor。Cookie もクレームも書かず、Slack に拒否', async () => {
      for (const firebase of [undefined, {}, { sign_in_second_factor: 'totp' }]) {
        vi.mocked(notifySlackFireAndForget).mockClear()
        await seedPending()
        mockVerifyIdToken.mockResolvedValue({ ...DECODED, firebase } as never)
        const response = await POST(makeRequest())
        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'no_second_factor' })
        expect(response.cookies.get('session')).toBeUndefined()
        expect(slackMessages()[0]).toMatch(/^\[ログイン拒否\] pc1@example\.com \/ 2要素目を通っていないトークン \/ /)
      }
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled()
      expect(mockCreateSessionCookie).not.toHaveBeenCalled()
    })

    it('verifyIdToken が認証失敗コードを返したら 401（Slack に通知しない）', async () => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })
      const response = await POST(makeRequest())
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'invalid_credentials' })
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    })

    // firebase-admin は不正なトークンにも公開鍵の取得失敗にも auth/argument-error を返すため、メッセージで分ける
    it.each([
      ['形式が不正', 'Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token.', 401],
      ['署名が不正', 'Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/admin/verify-id-tokens', 401],
      ['公開鍵の取得失敗', 'Error fetching public keys for Google certs: 500', 503],
    ])('auth/argument-error（%s）は %s', async (_label, message, status) => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message })
      expect((await POST(makeRequest())).status).toBe(status)
      expect(vi.mocked(notifySlackFireAndForget).mock.calls.length > 0).toBe(status === 503)
    })

    it('verifyIdToken のインフラ障害は 503', async () => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/internal-error', message: 'Firebase down' })
      expect((await POST(makeRequest())).status).toBe(503)
    })
  })

  // 1段目で確かめているが、コードだけを別のブラウザから送られても通さない
  describe('端末・ブラウザの確認（もう一度）', () => {
    it.each([
      ['Mac の Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'],
      ['User-Agent なし', null],
    ])('%s は 403 client_not_allowed、Cookie なし', async (_label, userAgent) => {
      const response = await POST(makeRequest({ userAgent }))
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'client_not_allowed' })
      expect(response.cookies.get('session')).toBeUndefined()
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled()
      expect(slackMessages()[0]).toMatch(/^\[ログイン拒否\] pc1@example\.com \/ Windows 以外の端末/)
    })

    it('どんな User-Agent でも 200 か 403（5xx にならない）', async () => {
      await fc.assert(fc.asyncProperty(fc.string({ maxLength: 300 }), async (ua) => {
        await seedPending()
        const status = (await POST(makeRequest({ userAgent: ua }))).status
        expect([200, 403]).toContain(status)
      }), { numRuns: 100 })
    })
  })

  it('createSessionCookie が失敗したら 503', async () => {
    mockCreateSessionCookie.mockRejectedValue(new Error('Firebase Auth down'))
    expect((await POST(makeRequest())).status).toBe(503)
  })

  // ログイン成功は毎回 Slack に通知する（旅館の外からのログインに気付くため）
  it('ログイン成功で、アカウント・IP・ブラウザを Slack に通知する（ヘッダーの書式は無効にする）', async () => {
    const response = await POST(makeRequest({ forwardedFor: `<!channel>, ${IP}`, userAgent: `${CHROME_WIN} Edg/141.0.0.0` }))
    expect(response.status).toBe(200)
    expect(notifySlackFireAndForget).toHaveBeenCalledTimes(1)
    const message = slackMessages()[0]
    expect(message).toMatch(/^\[ログイン\] pc1@example\.com \/ IP \?, 203\.0\.113\.5/)
    expect(message).toContain('Edge on Windows')
    expect(message).not.toContain('<!channel>')
  })

  it('コード・途中の状態の秘密の値は、ログにも Slack にもレスポンスにも出ない', async () => {
    wrongCode()
    const bodies = [await (await POST(makeRequest())).text()]
    mockFinalize.mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'x'))
    bodies.push(await (await POST(makeRequest())).text())
    const everything = JSON.stringify([
      vi.mocked(logger.info).mock.calls, vi.mocked(logger.warn).mock.calls, vi.mocked(logger.error).mock.calls,
      vi.mocked(notifySlackFireAndForget).mock.calls, bodies,
    ])
    for (const secret of SECRETS) expect(everything).not.toContain(secret)
    expect(vi.mocked(logger.warn).mock.calls.length).toBeGreaterThan(0)
  })

  // 1アカウント1セッション。最後のログインの時刻をユーザーのクレームに書き、verifySession が Cookie の時刻と比べる
  describe('1アカウント1セッション', () => {
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
      expect(slackMessages()[0]).toMatch(/^\[ALERT\]/)
    })

    // 断ったログインでクレームを書くと、正しいスタッフのセッションが切れてしまう
    it.each([
      ['コードが違う', () => { wrongCode(); return makeRequest() }],
      ['端末・ブラウザで断った', () => makeRequest({ userAgent: null })],
      ['トークンが不正', () => { mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'x' }); return makeRequest() }],
    ])('%s ときはクレームを書かない', async (_label, request) => {
      await POST(request())
      expect(mockSetCustomUserClaims).not.toHaveBeenCalled()
    })

    describe('前のセッションを切ったことの通知', () => {
      const jstSeconds = (iso: string) => Date.parse(`${iso}+09:00`) / 1000
      const NOW_AUTH_TIME = jstSeconds('2026-05-20T11:59:00')

      beforeEach(async () => {
        vi.useFakeTimers()
        setNowJST('2026-05-20T12:00')
        await seedPending()
        mockVerifyIdToken.mockResolvedValue({ ...DECODED, auth_time: NOW_AUTH_TIME } as never)
      })
      async function notice(previous: unknown): Promise<string> {
        mockGetUser.mockResolvedValue({ customClaims: previous === undefined ? undefined : { sessionAuthTime: previous } } as never)
        expect((await POST(makeRequest())).status).toBe(200)
        return slackMessages()[0]
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
})
