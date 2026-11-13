import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { setNowJST } from '@tests/utils/timeHelper'
import { POST } from '@/app/api/auth/login/route'
import { InfraError } from '@/types/errors'

// ログインの1段目（パスワード → SMS の送信）。2段目（コード → Session Cookie）は ./verify/route.test.ts。
// パスワードの確認と SMS の送信（Firebase の REST）はモック。失敗回数・SMS の通数・途中の状態はメモリ（判定は本物の domain）
vi.mock('@/infra/auth/passwordSignIn', () => ({ signInWithPassword: vi.fn(), isPasswordSignInConfigured: vi.fn() }))
import { isPasswordSignInConfigured, signInWithPassword } from '@/infra/auth/passwordSignIn'
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
vi.mock('@/infra/auth/mfaSignIn', () => ({ startPhoneMfa: vi.fn(), finalizePhoneMfa: vi.fn() }))
import { startPhoneMfa } from '@/infra/auth/mfaSignIn'
vi.mock('@/infra/auth/firestoreMfaPendingRepository', async () => {
  const { createMemoryMfaPendingRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreMfaPendingRepository: createMemoryMfaPendingRepository() }
})
vi.mock('@/infra/auth/firestoreSmsQuotaRepository', async () => {
  const { createMemorySmsQuotaRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreSmsQuotaRepository: createMemorySmsQuotaRepository() }
})
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { firestoreSmsQuotaRepository } from '@/infra/auth/firestoreSmsQuotaRepository'
import type { createMemoryMfaPendingRepository, createMemorySmsQuotaRepository } from '@tests/utils/memoryMfaRepositories'
import { MFA_PENDING_TTL_MS, MFA_SMS_DAILY_LIMIT } from '@/constants/auth'
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>
const quota = firestoreSmsQuotaRepository as ReturnType<typeof createMemorySmsQuotaRepository>
const mockSignIn = vi.mocked(signInWithPassword)
const MFA_REQUIRED = { success: true as const, value: { kind: 'mfa_required' as const, mfaPendingCredential: 'pending-cred-must-not-leak', mfaEnrollmentId: 'phone-1', phoneHint: '+81*******1234' } }

// adminAuth はモック（1段目では Session Cookie を作らない。呼ばれないことを確かめる）
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
    throttle.clear(); pendings.clear(); quota.clear()
    mockSignIn.mockResolvedValue(MFA_REQUIRED)
    vi.mocked(isPasswordSignInConfigured).mockReturnValue(true)
    vi.mocked(startPhoneMfa).mockResolvedValue({ success: true, value: { sessionInfo: 'session-info-must-not-leak' } })
  })

  it('パスワードが合えば SMS を送り、200 と伏せ字の電話番号、途中の状態の Cookie を返す（Session Cookie はまだ）', async () => {
    const response = await POST(makeRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ mfaRequired: true, phoneHint: '+81*******1234' })
    expect(startPhoneMfa).toHaveBeenCalledWith('pending-cred-must-not-leak', 'phone-1', null) // 開発・Emulator は token なし
    expect(response.cookies.get('session')).toBeUndefined()
    expect(mockVerifyIdToken).not.toHaveBeenCalled()
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled() // 前のセッションを切らない（切るのはコードが合ってから）

    const setCookie = response.headers.get('set-cookie') ?? ''
    const pendingId = response.cookies.get('mfa_pending')?.value ?? ''
    expect(pendingId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Strict/i)
    expect(setCookie).toContain('Path=/api/auth/login')
    expect(setCookie).toContain(`Max-Age=${MFA_PENDING_TTL_MS / 1000}`)
    // 秘密の値はブラウザに渡さない
    expect(setCookie + JSON.stringify(await POST(makeRequest()).then((r) => r.json()))).not.toMatch(/must-not-leak/)
    expect(pendings.items.get(pendingId)).toMatchObject({ email: 'pc1@example.com', sessionInfo: 'session-info-must-not-leak' })
  })

  // Secure（HTTPS のときだけ送る）は本番だけで付ける。ローカルの HTTP では動きを確かめられないので、付く条件だけを見る
  describe('途中の状態の Cookie の Secure', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.useRealTimers()
    })
    it('production では Secure を付ける', async () => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T12:00') // 本番は時間外のログインを断るので、営業時間内にする
      vi.stubEnv('NODE_ENV', 'production')
      expect((await POST(makeRequest())).headers.get('set-cookie')).toMatch(/;\s*Secure(;|$)/i)
    })
    it('development / test では付けない', async () => {
      expect((await POST(makeRequest())).headers.get('set-cookie')).not.toMatch(/;\s*Secure(;|$)/i)
    })
  })

  it('2要素目なしで通った（電話を登録していない）アカウントは 403 mfa_not_enrolled。SMS も Cookie もなし、Slack に拒否', async () => {
    mockSignIn.mockResolvedValue({ success: true, value: { kind: 'signed_in', idToken: 'id-token-from-rest' } })
    const response = await POST(makeRequest())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'mfa_not_enrolled' })
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(startPhoneMfa).not.toHaveBeenCalled()
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
    expect(vi.mocked(notifySlackFireAndForget).mock.calls[0][0]).toMatch(/^\[ログイン拒否\] pc1@example\.com \/ SMS の2要素目が未登録のアカウント \/ /)
  })

  // 本番の Identity Platform は、SMS の前にブラウザで作った reCAPTCHA Enterprise の token を求める
  describe('reCAPTCHA の token', () => {
    it('body の recaptchaToken を、そのまま SMS の送信に渡す', async () => {
      expect((await POST(makeRequest({ ...VALID, recaptchaToken: 'token-from-browser' }))).status).toBe(200)
      expect(startPhoneMfa).toHaveBeenCalledWith('pending-cred-must-not-leak', 'phone-1', 'token-from-browser')
    })

    it.each([
      ['空', ''],
      ['長すぎる（4097 文字）', 't'.repeat(4097)],
      ['文字列でない', 123],
    ])('token が%sなら 400（パスワードを確かめず、数えない）', async (_label, recaptchaToken) => {
      expect((await POST(makeRequest({ ...VALID, recaptchaToken }))).status).toBe(400)
      expect(mockSignIn).not.toHaveBeenCalled()
      expect(throttle.states.size).toBe(0)
    })

    it('Google が token を断ったら 403 recaptcha_failed。途中の状態の Cookie なし、Slack に拒否（数えない）', async () => {
      vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'recaptcha_rejected', code: 'INVALID_RECAPTCHA_TOKEN' } })
      const response = await POST(makeRequest({ ...VALID, recaptchaToken: 'stale-token' }))
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'recaptcha_failed' })
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(vi.mocked(notifySlackFireAndForget).mock.calls[0][0]).toMatch(/^\[ログイン拒否\] pc1@example\.com \/ reCAPTCHA の確認で断られた/)
      expect([...throttle.states.values()].every((st) => st.failures === 0)).toBe(true)
    })

    it('token はログにも Slack にも出ない', async () => {
      vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'recaptcha_rejected', code: 'INVALID_RECAPTCHA_TOKEN' } })
      await POST(makeRequest({ ...VALID, recaptchaToken: 'token-must-not-leak-77' }))
      const everything = JSON.stringify([vi.mocked(logger.info).mock.calls, vi.mocked(logger.warn).mock.calls, vi.mocked(notifySlackFireAndForget).mock.calls])
      expect(everything).not.toContain('token-must-not-leak-77')
    })
  })

  describe('SMS の送信', () => {
    it(`1アカウント1日 ${MFA_SMS_DAILY_LIMIT} 通まで。超えたら送らずに 429 sms_limit、Slack は1回だけ`, async () => {
      for (let i = 0; i < MFA_SMS_DAILY_LIMIT; i++) expect((await POST(makeRequest())).status).toBe(200)
      const over = await POST(makeRequest())
      expect(over.status).toBe(429)
      expect(await over.json()).toEqual({ error: 'sms_limit' })
      expect(over.headers.get('set-cookie')).toBeNull()
      await POST(makeRequest())
      expect(startPhoneMfa).toHaveBeenCalledTimes(MFA_SMS_DAILY_LIMIT)
      const notices = vi.mocked(notifySlackFireAndForget).mock.calls.map(([m]) => m).filter((m) => m.startsWith('[SMS 上限]'))
      expect(notices).toHaveLength(1)
    })

    it('端末・ブラウザで断ったときは SMS を送らず、通数も数えない', async () => {
      for (let i = 0; i < MFA_SMS_DAILY_LIMIT + 1; i++) expect((await POST(makeRequest(VALID, null))).status).toBe(403)
      expect(startPhoneMfa).not.toHaveBeenCalled()
      expect((await POST(makeRequest())).status).toBe(200)
    })

    it('パスワードが違えば SMS を送らない', async () => {
      mockSignIn.mockResolvedValue({ success: false, error: { kind: 'invalid_credentials', code: 'INVALID_LOGIN_CREDENTIALS' } })
      expect((await POST(makeRequest())).status).toBe(401)
      expect(startPhoneMfa).not.toHaveBeenCalled()
    })

    it('Firebase 自身が送信を止めたら 429 too_many_attempts（画面は待ち時間を出す）', async () => {
      vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'throttled', code: 'QUOTA_EXCEEDED' } })
      const response = await POST(makeRequest())
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ error: 'too_many_attempts', retryAfterSeconds: 60 })
      expect(response.headers.get('set-cookie')).toBeNull()
    })

    it.each([
      ['SMS の送信（reCAPTCHA を求められた、など）', () => vi.mocked(startPhoneMfa).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in start failed: MISSING_RECAPTCHA_TOKEN (status 400)'))],
      ['途中の状態の保存', () => vi.spyOn(pendings, 'save').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))],
      ['通数の記録', () => vi.spyOn(quota, 'consume').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))],
    ])('%s の障害は 503 と Slack の ALERT。Cookie なし', async (_label, fail) => {
      fail()
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(vi.mocked(notifySlackFireAndForget).mock.calls[0][0]).toMatch(/^\[ALERT\] ログインエラー/)
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

  // 旅館の PC（Windows）の Chrome・Edge だけ。パスワードが合っていても、それ以外には SMS を送らない
  describe('端末・ブラウザの確認', () => {

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
    ])('%s は 403 client_not_allowed、SMS も Cookie もなし、Slack に拒否を通知', async (_label, ua, reasonLabel) => {
      const response = await POST(makeRequest(VALID, ua))
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'client_not_allowed' })
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(startPhoneMfa).not.toHaveBeenCalled()
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

    it('どんな User-Agent でも 200 か 403（5xx にならない）', async () => {
      await fc.assert(fc.asyncProperty(fc.string({ maxLength: 300 }), async (ua) => {
        const status = (await POST(makeRequest(VALID, ua))).status
        expect([200, 403]).toContain(status)
      }), { numRuns: 100 })
    })
  })

  // パスワードはサーバーが Firebase の REST で確かめる。失敗が続いたメールアドレス・IP は iPhone のように長く止める
  describe('パスワードの確認と、失敗回数の制限', () => {
    const MIN = 60
    const wrong = () => mockSignIn.mockResolvedValue({ success: false, error: { kind: 'invalid_credentials', code: 'INVALID_LOGIN_CREDENTIALS' } })
    const from = (ip: string, body: object = VALID) => new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': CHROME_WIN, 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    })
    const slackMessages = () => vi.mocked(notifySlackFireAndForget).mock.calls.map((c) => c[0])

    beforeEach(() => {
      vi.useFakeTimers()
      setNowJST('2026-05-20T10:00')
    })
    afterEach(() => vi.useRealTimers())

    it('メールアドレスとパスワードを REST に渡す', async () => {
      expect((await POST(makeRequest())).status).toBe(200)
      expect(mockSignIn).toHaveBeenCalledWith('pc1@example.com', PASSWORD)
    })

    it('違えば 401。Cookie を作らず、失敗を1回数える（2回までは止めない・知らせない）', async () => {
      wrong()
      for (let i = 0; i < 2; i++) {
        const response = await POST(from('203.0.113.5'))
        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({ error: 'invalid_credentials' })
      }
      expect(startPhoneMfa).not.toHaveBeenCalled()
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
      mockSignIn.mockResolvedValue(MFA_REQUIRED) // 正しいパスワードでも
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

    // 0 に戻すのは SMS のコードが合ったとき（verify）。パスワードが合っただけで戻すと、コードを無限に試せる
    it('パスワードが合っても、メールアドレスと IP の回数は 0 に戻さない（札は外す）', async () => {
      wrong()
      for (let i = 0; i < 2; i++) await POST(from('203.0.113.5'))
      mockSignIn.mockResolvedValue(MFA_REQUIRED)
      expect((await POST(from('203.0.113.5'))).status).toBe(200)
      expect(throttle.states.size).toBe(2)
      expect([...throttle.states.values()].every((st) => st.failures === 2 && st.pending.length === 0)).toBe(true)
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
      ['回数の確認と記録', () => vi.spyOn(throttle, 'acquire').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))],
    ])('%s の障害は 503 と Slack の ALERT（数えない）', async (_label, fail) => {
      fail()
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(slackMessages()[0]).toMatch(/^\[ALERT\] ログインエラー/)
      expect(throttle.states.size).toBe(0)
    })

    // バグハンティング（2026-11-11）: 「止まっていないか読む → Firebase で確かめる → 失敗を書く」の間に、同時のリクエストが割り込めないか
    it('同時に10回間違えても、Firebase に届くのは止める前の3回まで（同時に送って制限をすり抜けられない）', async () => {
      vi.useRealTimers()
      // Firebase の応答を少し待たせ、10件が同時に「確かめている最中」になるようにする
      mockSignIn.mockImplementation(() => new Promise((r) => setTimeout(() => r({ success: false, error: { kind: 'invalid_credentials', code: 'INVALID_LOGIN_CREDENTIALS' } }), 20)))
      const statuses = await Promise.all(Array.from({ length: 10 }, () => POST(from('203.0.113.5')).then((r) => r.status)))
      expect(mockSignIn.mock.calls.length, `Firebase に届いた回数。応答: ${statuses.join(',')}`).toBeLessThanOrEqual(3)
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(7)
    })

    // 試行中の札（コードレビューの指摘 1〜7 への対策）
    it('止まっているときは、トランザクション（札を出す処理）の前に安く 429 を返す', async () => {
      wrong()
      for (let i = 0; i < 3; i++) await POST(from('203.0.113.5'))
      const acquire = vi.spyOn(throttle, 'acquire')
      acquire.mockClear() // ほかのテストで付けた spy が残っていても、ここからの呼び出しだけを見る
      expect((await POST(from('203.0.113.5'))).status).toBe(429)
      expect(acquire).not.toHaveBeenCalled()
    })

    it('旅館の2台が同時に正しいパスワードで入っても、IP の札が埋まった方は「少し待って」になり、送り直せば入れる', async () => {
      vi.useRealTimers()
      // 旅館の IP はすでに2回失敗している（残り1枚）
      wrong()
      await POST(from('203.0.113.5', { email: 'typo1@example.com', password: 'xxx' }))
      await POST(from('203.0.113.5', { email: 'typo2@example.com', password: 'xxx' }))
      mockSignIn.mockImplementation(() => new Promise((r) => setTimeout(() => r(MFA_REQUIRED), 20)))
      const [a, b] = await Promise.all([
        POST(from('203.0.113.5', { email: 'pc1@example.com', password: PASSWORD })),
        POST(from('203.0.113.5', { email: 'pc2@example.com', password: PASSWORD })),
      ])
      expect([a.status, b.status].sort()).toEqual([200, 429])
      const busy = a.status === 429 ? a : b
      expect(await busy.json()).toEqual({ error: 'attempt_in_progress', retryAfterSeconds: 1 })
      // 1台目の札が外れたので、送り直せば入れる（パスワードが合っただけなので回数は 2 のまま。止める段に届いていない）
      expect((await POST(from('203.0.113.5', { email: 'pc2@example.com', password: PASSWORD }))).status).toBe(200)
    })

    it('正しいパスワードなら、札を外す処理が失敗しても SMS まで進む（札は自然に消える）', async () => {
      vi.spyOn(throttle, 'complete').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))
      const response = await POST(makeRequest())
      expect(response.status).toBe(200)
      expect(slackMessages()).toContain('[ALERT] ログインの回数の記録に失敗(FIRESTORE_UNAVAILABLE)。結果: void')
    })

    it('Firebase の障害のあとに札を外す処理まで失敗しても、元の障害（AUTH_UNAVAILABLE）を知らせる', async () => {
      mockSignIn.mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'Password sign-in request failed'))
      vi.spyOn(throttle, 'complete').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable'))
      const response = await POST(makeRequest())
      expect(response.status).toBe(503)
      expect(slackMessages().some((m) => m.startsWith('[ALERT] ログインエラー(AUTH_UNAVAILABLE)'))).toBe(true)
    })

    it('Firebase 自身が止めた（TOO_MANY_ATTEMPTS_TRY_LATER）ときは失敗として数え、503 ではなく 429', async () => {
      mockSignIn.mockResolvedValue({ success: false, error: { kind: 'firebase_throttled', code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
      const first = await POST(from('203.0.113.5'))
      expect(first.status).toBe(429)
      expect(await first.json()).toEqual({ error: 'too_many_attempts', retryAfterSeconds: 60 })
      expect(slackMessages().filter((m) => m.startsWith('[ALERT]'))).toEqual([])
      for (let i = 0; i < 2; i++) await POST(from('203.0.113.5'))
      // 3回目でこちらも止めるので、Firebase に送らなくなる
      mockSignIn.mockClear()
      expect((await POST(from('203.0.113.5'))).status).toBe(429)
      expect(mockSignIn).not.toHaveBeenCalled()
    })

    it('API キーが設定されていなければ、回数を読まずにすぐ 503（CI の ZAP・本番の設定忘れ）', async () => {
      vi.mocked(isPasswordSignInConfigured).mockReturnValue(false)
      const read = vi.spyOn(throttle, 'acquire')
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

