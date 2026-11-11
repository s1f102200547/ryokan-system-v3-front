import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { setNowJST } from '@tests/utils/timeHelper'
import { POST } from '@/app/api/auth/login/route'

// adminAuth の verifyIdToken / createSessionCookie をモック
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
  },
  adminDb: {},
}))
import { adminAuth } from '@/lib/firebase/admin'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const mockVerifyIdToken = vi.mocked(adminAuth.verifyIdToken)
const mockCreateSessionCookie = vi.mocked(adminAuth.createSessionCookie)

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

// 既定は旅館の PC の Chrome（ログインは Windows の Chrome・Edge だけ）
function makeRequest(body: object, userAgent: string | null = CHROME_WIN) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(userAgent === null ? {} : { 'user-agent': userAgent }) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有効な idToken がクライアントから来たら 200 と session Cookie を返す', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value')

    const response = await POST(makeRequest({ idToken: 'valid-id-token' }))
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
      const response = await POST(makeRequest({ idToken: 'valid-id-token' }))
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

  it('クライアントからのデータにidToken がない場合 400 を返す', async () => {
    const response = await POST(makeRequest({}))

    expect(response.status).toBe(400)
  })

  it('クライアントからのidToken が空文字の場合 400 を返す', async () => {
    const response = await POST(makeRequest({ idToken: '' }))

    expect(response.status).toBe(400)
  })

  it('verifyIdToken が認証失敗コードを返した場合 401 を返す', async () => {
    // CREDENTIAL_ERROR_CODES に含まれる code を持つエラー（Firebase Admin が実際に throw する形式）
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })

    const response = await POST(makeRequest({ idToken: 'invalid-id-token' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('invalid_credentials')
  })

  it('verifyIdToken がインフラ障害（認証失敗コード以外）の場合 503 を返す', async () => {
    // CREDENTIAL_ERROR_CODES に含まれない code → インフラ障害扱い
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/internal-error', message: 'Firebase down' })

    const response = await POST(makeRequest({ idToken: 'valid-id-token' }))

    expect(response.status).toBe(503)
  })

  it('createSessionCookie が失敗した場合 503 を返す', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'uid-1', email: 'pc1@example.com' } as never)
    mockCreateSessionCookie.mockRejectedValue(new Error('Firebase Auth down'))

    const response = await POST(makeRequest({ idToken: 'valid-id-token' }))

    expect(response.status).toBe(503)
  })

  // request.json() を catch しておらず 500 になっていた
  it.each([
    ['不正な JSON', '{"idToken":'],
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
    const response = await POST(makeRequest({ idToken: 'x' }))
    expect(response.status).toBe(401)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  it.each([
    ['HTTP エラー', 'Error fetching public keys for Google certs: 500'],
    ['接続できない', 'connect ETIMEDOUT 142.250.0.1:443'],
  ])('auth/argument-error でも公開鍵の取得失敗（%s）は 503 + Slack 通知', async (_label, message) => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message })
    const response = await POST(makeRequest({ idToken: 'x' }))
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
      body: JSON.stringify({ idToken: 'valid-id-token' }),
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
    await POST(makeRequest({ idToken: 'x' }))
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
      expect((await POST(makeRequest({ idToken: 't' }, ua))).status).toBe(200)
    })

    it.each([
      ['Mac の Chrome', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Windows 以外の端末'],
      ['Android の Chrome', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', 'Windows 以外の端末'],
      ['Windows の Firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Chrome・Edge 以外のブラウザ'],
      ['Windows の Opera', `${CHROME_WIN} OPR/120.0.0.0`, 'Chrome・Edge 以外のブラウザ'],
      ['Windows の HeadlessChrome', CHROME_WIN.replace('Chrome/', 'HeadlessChrome/'), 'Chrome・Edge 以外のブラウザ'],
      ['User-Agent なし', null, 'Windows 以外の端末'],
    ])('%s は 403 client_not_allowed、Cookie なし、Slack に拒否を通知', async (_label, ua, reasonLabel) => {
      const response = await POST(makeRequest({ idToken: 't' }, ua))
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
        body: JSON.stringify({ idToken: 't' }),
      }))
      expect(response.status).toBe(403)
      const message = vi.mocked(notifySlackFireAndForget).mock.calls[0][0]
      expect(message).not.toContain('<!')
      expect(message).toContain('IP ?, 203.0.113.5')
      expect(message).toContain('その他のブラウザ on Linux')
    })

    it('トークンが不正なら、User-Agent に関係なく 401（拒否の通知はしない）', async () => {
      mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })
      expect((await POST(makeRequest({ idToken: 't' }, null))).status).toBe(401)
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    })

    it('どんな User-Agent でも 200 か 403（5xx にならない）', async () => {
      await fc.assert(fc.asyncProperty(fc.string({ maxLength: 300 }), async (ua) => {
        const status = (await POST(makeRequest({ idToken: 't' }, ua))).status
        expect([200, 403]).toContain(status)
      }), { numRuns: 100 })
    })
  })
})
