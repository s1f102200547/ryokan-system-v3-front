import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/auth/login/route'
import { InfraError } from '@/types/errors'
import { getTodayJST } from '@/lib/dateUtils'
import { MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

// ログインの1段目（/api/auth/login）のデシジョンテーブル（docs/MfaBugHunt.md の S3）。
// 条件: MFA_MODE × 前の状態 × パスワードの結果 × 端末 × SMS の送信の結果 × token × （SMS なしのとき）ID トークン・Session Cookie。
// 結果: status・本文・途中の状態の Cookie・Session Cookie・SMS を送ったか・SMS の通数・失敗の回数・Slack の通知の種類。
// 各行の前に、パスワードの失敗を1回だけ記録しておく。試行の結果が「成功 → 0 / 数えない → 1 / 失敗 → 2」で見分けられる。
// 仕様が決まっていない欄は '未定'（確かめない。docs/MfaBugHuntFindings.md の ID を note に書く）

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
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>
const quota = firestoreSmsQuotaRepository as ReturnType<typeof createMemorySmsQuotaRepository>

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn(), getUser: vi.fn(), setCustomUserClaims: vi.fn(), createSessionCookie: vi.fn() },
  adminDb: {},
}))
import { adminAuth } from '@/lib/firebase/admin'
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const EMAIL = 'pc1@example.com'
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const DECODED = { uid: 'uid-1', email: EMAIL, auth_time: 1_779_000_000, firebase: { sign_in_provider: 'password' } }

type Password = 'MFA あり' | 'MFA なし' | '違う' | 'Firebase が止めた' | '障害'
type Start = 'ok' | 'throttled' | 'recaptcha_rejected' | '障害'
type Undecided = '未定'
type Row = {
  mode: string | undefined                       // MFA_MODE（undefined は未設定）
  pre?: '失敗1回' | '止まっている' | 'SMS 上限'   // 既定は '失敗1回'
  password: Password
  client?: 'Windows の Chrome' | 'Linux'          // 既定は Windows の Chrome
  start?: Start                                   // MFA ありのとき。既定は ok
  token?: boolean                                 // body の recaptchaToken
  idToken?: 'ok' | '無効' | '障害'               // MFA なしで Cookie を出すとき。既定は ok
  session?: 'ok' | '失敗'                         // Session Cookie の作成。既定は ok
  expected: {
    status: number
    body: object
    mfaCookie: '発行' | '消す' | 'なし'
    sessionCookie: boolean
    smsSent: boolean
    smsCount: number | Undecided                  // 行のあとの今日の通数
    failures: number | Undecided                  // 行のあとの、メールアドレスの確定した失敗の回数
    slack: string[]                               // 行の中で出た通知の種類（[ログイン拒否] など）
  }
  note?: string
}

const MFA = { mfaRequired: true, phoneHint: '+81*******1234' }
const TOO_MANY = { error: 'too_many_attempts', retryAfterSeconds: 60 }
// 5xx の本文はどの経路でも internal server error（F-08 でそろえた。画面は本文を読まず同じ文言を出す）

// 失敗の回数: 成功 = 0（記録を消す）/ 数えない（void）= 1 / 失敗 = 2 / 止まっている = 3（止めている間は数えない）
const ROWS: [string, Row][] = [
  // --- MFA_MODE=all（未設定・想定外も all）
  ['all: MFA あり → SMS を送り、途中の状態の Cookie', { mode: 'all', password: 'MFA あり',
    expected: { status: 200, body: MFA, mfaCookie: '発行', sessionCookie: false, smsSent: true, smsCount: 1, failures: 1, slack: [] } }],
  ['all: MFA あり・token あり → token を添えて送る', { mode: 'all', password: 'MFA あり', token: true,
    expected: { status: 200, body: MFA, mfaCookie: '発行', sessionCookie: false, smsSent: true, smsCount: 1, failures: 1, slack: [] } }],
  ['未設定: MFA あり → all と同じ', { mode: undefined, password: 'MFA あり',
    expected: { status: 200, body: MFA, mfaCookie: '発行', sessionCookie: false, smsSent: true, smsCount: 1, failures: 1, slack: [] } }],
  ['all: MFA あり・Linux → 端末で断る（SMS なし、数えない）', { mode: 'all', password: 'MFA あり', client: 'Linux',
    expected: { status: 403, body: { error: 'client_not_allowed' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ログイン拒否'] } }],
  ['all: MFA なし → 未登録で断る', { mode: 'all', password: 'MFA なし',
    expected: { status: 403, body: { error: 'mfa_not_enrolled' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ログイン拒否'] } }],
  ['想定外の値: MFA なし → all と同じに断る', { mode: 'ENROLLED_ONLY', password: 'MFA なし',
    expected: { status: 403, body: { error: 'mfa_not_enrolled' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ログイン拒否'] } }],
  ['all: MFA なし・Linux → 端末を先に確かめる', { mode: 'all', password: 'MFA なし', client: 'Linux',
    expected: { status: 403, body: { error: 'client_not_allowed' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ログイン拒否'] } }],
  ['all: パスワードが違う → 401、失敗に数える', { mode: 'all', password: '違う',
    expected: { status: 401, body: { error: 'invalid_credentials' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 2, slack: [] } }],
  ['all: パスワードが違う・Linux → パスワードを先に確かめる（401）', { mode: 'all', password: '違う', client: 'Linux',
    expected: { status: 401, body: { error: 'invalid_credentials' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 2, slack: [] } }],
  ['all: Firebase がパスワードの確認を止めた → 429、失敗に数える', { mode: 'all', password: 'Firebase が止めた',
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 2, slack: [] } }],
  ['all: パスワードの確認の障害 → 503、数えない', { mode: 'all', password: '障害',
    expected: { status: 503, body: { error: 'internal server error' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ALERT'] } }],
  ['all: Firebase が SMS を止めた → 429、通数は戻す', { mode: 'all', password: 'MFA あり', start: 'throttled',
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'なし', sessionCookie: false, smsSent: true, smsCount: 0, failures: 1, slack: [] },
    note: 'F-01（数えるのは送れた SMS）' }],
  ['all: reCAPTCHA の token を断られた → 403、通数は戻す', { mode: 'all', password: 'MFA あり', start: 'recaptcha_rejected', token: true,
    expected: { status: 403, body: { error: 'recaptcha_failed' }, mfaCookie: 'なし', sessionCookie: false, smsSent: true, smsCount: 0, failures: 1, slack: ['ログイン拒否'] },
    note: 'F-01' }],
  ['all: SMS の送信の障害 → 503、通数は戻す', { mode: 'all', password: 'MFA あり', start: '障害',
    expected: { status: 503, body: { error: 'internal server error' }, mfaCookie: 'なし', sessionCookie: false, smsSent: true, smsCount: 0, failures: 1, slack: ['ALERT'] },
    note: 'F-01' }],
  ['all: 今日の SMS が上限 → 429 sms_limit、送らない', { mode: 'all', pre: 'SMS 上限', password: 'MFA あり',
    expected: { status: 429, body: { error: 'sms_limit' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: MFA_SMS_DAILY_LIMIT + 1, failures: 1, slack: ['SMS 上限'] } }],
  ['all: 止まっている → 429、パスワードを確かめない', { mode: 'all', pre: '止まっている', password: 'MFA あり',
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 3, slack: [] } }],

  // --- MFA_MODE=enrolled_only（本番で SMS を試す間）
  ['enrolled_only: MFA あり → all と同じく SMS', { mode: 'enrolled_only', password: 'MFA あり',
    expected: { status: 200, body: MFA, mfaCookie: '発行', sessionCookie: false, smsSent: true, smsCount: 1, failures: 1, slack: [] } }],
  ['enrolled_only: MFA なし → SMS なしで Session Cookie、失敗の回数を 0 に', { mode: 'enrolled_only', password: 'MFA なし',
    expected: { status: 200, body: { success: true }, mfaCookie: '消す', sessionCookie: true, smsSent: false, smsCount: 0, failures: 0, slack: ['ログイン'] } }],
  ['enrolled_only: MFA なし・Linux → 端末で断る', { mode: 'enrolled_only', password: 'MFA なし', client: 'Linux',
    expected: { status: 403, body: { error: 'client_not_allowed' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ログイン拒否'] },
    note: 'F-07（0 に戻すのは Session Cookie を出せたときだけ）' }],
  ['enrolled_only: MFA なし・トークンが無効 → 401 login_failed', { mode: 'enrolled_only', password: 'MFA なし', idToken: '無効',
    expected: { status: 401, body: { error: 'login_failed' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ログイン拒否'] },
    note: 'F-07' }],
  ['enrolled_only: MFA なし・トークンの確認の障害 → 503', { mode: 'enrolled_only', password: 'MFA なし', idToken: '障害',
    expected: { status: 503, body: { error: 'internal server error' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ALERT'] },
    note: 'F-07' }],
  ['enrolled_only: MFA なし・Session Cookie を作れない → 503', { mode: 'enrolled_only', password: 'MFA なし', session: '失敗',
    expected: { status: 503, body: { error: 'internal server error' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 1, slack: ['ALERT'] },
    note: 'F-07' }],
  ['enrolled_only: パスワードが違う → 401、失敗に数える', { mode: 'enrolled_only', password: '違う',
    expected: { status: 401, body: { error: 'invalid_credentials' }, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 2, slack: [] } }],
  ['enrolled_only: 止まっている → 429（MFA なしでも確かめない）', { mode: 'enrolled_only', pre: '止まっている', password: 'MFA なし',
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'なし', sessionCookie: false, smsSent: false, smsCount: 0, failures: 3, slack: [] } }],
]

function request(body: object, userAgent: string) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': userAgent },
    body: JSON.stringify(body),
  })
}

const WRONG = { success: false as const, error: { kind: 'invalid_credentials' as const, code: 'INVALID_LOGIN_CREDENTIALS' } }

async function arrange(row: Row) {
  // 前の状態（パスワードを間違えた記録）を、本物の手順で作る
  vi.mocked(signInWithPassword).mockResolvedValue(WRONG)
  const failuresBefore = row.pre === '止まっている' ? 3 : 1
  for (let i = 0; i < failuresBefore; i++) await POST(request({ email: EMAIL, password: 'wrong-password' }, CHROME_WIN))
  if (row.pre === 'SMS 上限') quota.states.set(EMAIL, { date: getTodayJST(), count: MFA_SMS_DAILY_LIMIT })

  const signIn = {
    'MFA あり': { success: true as const, value: { kind: 'mfa_required' as const, mfaPendingCredential: 'cred', mfaEnrollmentId: 'phone-1', phoneHint: '+81*******1234' } },
    'MFA なし': { success: true as const, value: { kind: 'signed_in' as const, idToken: 'id-token' } },
    '違う': WRONG,
    'Firebase が止めた': { success: false as const, error: { kind: 'firebase_throttled' as const, code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } },
  }
  if (row.password === '障害') vi.mocked(signInWithPassword).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'Password sign-in request failed'))
  else vi.mocked(signInWithPassword).mockResolvedValue(signIn[row.password])

  const start = row.start ?? 'ok'
  if (start === 'ok') vi.mocked(startPhoneMfa).mockResolvedValue({ success: true, value: { sessionInfo: 'session-info' } })
  if (start === 'throttled') vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'throttled', code: 'QUOTA_EXCEEDED' } })
  if (start === 'recaptcha_rejected') vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'recaptcha_rejected', code: 'INVALID_RECAPTCHA_TOKEN', description: '' } })
  if (start === '障害') vi.mocked(startPhoneMfa).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in start failed: INTERNAL_ERROR (status 500)'))

  const idToken = row.idToken ?? 'ok'
  if (idToken === 'ok') vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(DECODED as never)
  if (idToken === '無効') vi.mocked(adminAuth.verifyIdToken).mockRejectedValue({ code: 'auth/user-disabled', message: 'disabled' })
  if (idToken === '障害') vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('socket hang up'))
  vi.mocked(adminAuth.getUser).mockResolvedValue({ customClaims: undefined } as never)
  vi.mocked(adminAuth.setCustomUserClaims).mockResolvedValue(undefined)
  if ((row.session ?? 'ok') === 'ok') vi.mocked(adminAuth.createSessionCookie).mockResolvedValue('session-cookie-value')
  else vi.mocked(adminAuth.createSessionCookie).mockRejectedValue(new Error('internal-error'))

  // 前の状態を作ったときの呼び出しは数えない
  vi.mocked(notifySlackFireAndForget).mockClear()
  vi.mocked(signInWithPassword).mockClear()
  vi.mocked(startPhoneMfa).mockClear()
}

describe('/api/auth/login のデシジョンテーブル', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    throttle.clear(); pendings.clear(); quota.clear()
    vi.mocked(isPasswordSignInConfigured).mockReturnValue(true)
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(ROWS)('%s', async (_name, row) => {
    if (row.mode !== undefined) vi.stubEnv('MFA_MODE', row.mode)
    await arrange(row)

    const body = { email: EMAIL, password: 'correct-password', ...(row.token ? { recaptchaToken: 'token-from-browser' } : {}) }
    const response = await POST(request(body, row.client === 'Linux' ? CHROME_LINUX : CHROME_WIN))
    const e = row.expected

    expect(response.status).toBe(e.status)
    expect(await response.json()).toEqual(e.body)

    const mfaCookie = response.cookies.get('mfa_pending')
    if (e.mfaCookie === '発行') expect(mfaCookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    if (e.mfaCookie === '消す') expect(mfaCookie?.value).toBe('')
    if (e.mfaCookie === 'なし') expect(mfaCookie).toBeUndefined()
    expect(response.cookies.get('session')?.value).toBe(e.sessionCookie ? 'session-cookie-value' : undefined)
    // 途中の状態の保存は、Cookie を出したときだけ
    expect(pendings.items.size).toBe(e.mfaCookie === '発行' ? 1 : 0)

    // 止まっているときは、パスワードを Firebase に送らない
    expect(vi.mocked(signInWithPassword).mock.calls.length).toBe(row.pre === '止まっている' ? 0 : 1)
    expect(vi.mocked(startPhoneMfa).mock.calls.length).toBe(e.smsSent ? 1 : 0)
    if (e.smsSent) expect(vi.mocked(startPhoneMfa).mock.calls[0][2]).toBe(row.token ? 'token-from-browser' : null)

    if (e.smsCount !== '未定') expect(quota.states.get(EMAIL)?.count ?? 0).toBe(e.smsCount)
    if (e.failures !== '未定') {
      expect(throttle.states.get(`email:${EMAIL}`)?.failures ?? 0).toBe(e.failures)
      expect(throttle.states.get('ip:unknown')?.failures ?? 0).toBe(e.failures) // IP も同じに数える
    }
    // 試行中の札は、どの行でも応答までに外している（Session Cookie を出した後に外す行も。F-07）
    expect([...throttle.states.values()].every((st) => st.pending.length === 0)).toBe(true)

    const kinds = vi.mocked(notifySlackFireAndForget).mock.calls.map(([m]) => /^\[([^\]]+)\]/.exec(String(m))?.[1])
    expect(kinds).toEqual(e.slack)
  })
})
