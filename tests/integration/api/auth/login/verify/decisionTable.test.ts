import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/auth/login/verify/route'
import { InfraError } from '@/types/errors'
import { MFA_PENDING_TTL_MS } from '@/constants/auth'

// ログインの2段目（/api/auth/login/verify）のデシジョンテーブル（docs/MfaBugHunt.md の S4）。
// 条件: 途中の状態（Cookie・期限・接続元）× 前の状態（失敗の回数・同時の試行）× コードの確認の結果 × ID トークン × 2要素目 × 端末 ×
// Session Cookie の作成 × 途中の状態を消す処理。
// 結果: status・本文・途中の状態の Cookie（消す / そのまま）・Session Cookie・途中の状態が残るか・コードを Firebase に送ったか・
// 失敗の回数（メールアドレスと IP）・Slack の通知の種類。
// 各行の前に、コードの誤りを1回（行によっては2回・3回）本物の手順で記録しておく。成功 → 0 / 数えない → そのまま / 失敗 → +1

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
const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn(), getUser: vi.fn(), setCustomUserClaims: vi.fn(), createSessionCookie: vi.fn() },
  adminDb: {},
}))
import { adminAuth } from '@/lib/firebase/admin'
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const EMAIL = 'pc1@example.com'
const IP = '203.0.113.5'
const OTHER_IP = '198.51.100.9'
const PENDING_ID = 'pending-id-from-cookie'
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

type Row = {
  // 途中の状態。ok: 期限内・同じ接続元 / Cookie なし / 知らない ID / 期限切れ / IP 違い / 期限切れ・IP 違い / 接続元なし（保存も要求も X-Forwarded-For なし）
  pending?: 'ok' | 'Cookie なし' | '知らない ID' | '期限切れ' | 'IP 違い' | '期限切れ・IP 違い' | '接続元なし'
  pendingDelete?: 'ok' | 'InfraError' | 'Error'   // 途中の状態を消す処理
  pre?: 1 | 2 | 3 | '札が埋まっている'           // 前に記録したコードの誤り（3 で止まる）。既定は 1
  finalize?: '正' | '誤' | '期限切れ' | 'throttled' | '障害'
  idToken?: '有効' | '無効' | '障害'
  secondFactor?: 'phone' | 'なし'
  emailInToken?: boolean                         // ID トークンに email があるか（Slack の宛先）
  client?: 'Windows の Chrome' | 'Linux'
  session?: 'ok' | '失敗'
  expected: {
    status: number
    body: object
    mfaCookie: '消す' | 'そのまま'
    sessionCookie: boolean
    pendingLeft: boolean                          // 行のあとに、途中の状態が残っているか
    finalized: boolean                            // コードを Firebase に送ったか
    failures: number                              // 行のあとの確定した失敗の回数（メールアドレスと、要求の接続元の IP）
    slack: string[]
    slackAccount?: string                         // [ログイン拒否] に載るアカウント
  }
  note?: string
}

const SUCCESS = { success: true }
const EXPIRED = { error: 'mfa_expired' }
const TOO_MANY = { error: 'too_many_attempts', retryAfterSeconds: 60 }

const ROWS: [string, Row][] = [
  // --- 途中の状態
  ['すべて合う → 200 と Session Cookie、途中の状態を消し、回数を 0 に', {
    expected: { status: 200, body: SUCCESS, mfaCookie: '消す', sessionCookie: true, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン'] } }],
  ['Cookie がない → 401 mfa_expired（Firebase に送らない）', { pending: 'Cookie なし',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: true, finalized: false, failures: 1, slack: [] } }],
  ['知らない ID → 401 mfa_expired', { pending: '知らない ID',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: true, finalized: false, failures: 1, slack: [] } }],
  ['期限切れ → 401 mfa_expired、途中の状態を消す', { pending: '期限切れ',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: false, failures: 1, slack: [] } }],
  ['接続元が違う → 401 mfa_expired、途中の状態を消し、Slack（アカウントは載せない）', { pending: 'IP 違い',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: false, failures: 0, slack: ['ログイン拒否'], slackAccount: '（不明）' },
    note: '回数は要求の接続元（OTHER_IP）で見る。そこには記録がないので 0' }],
  ['期限切れで接続元も違う → 期限切れを先に見る（Slack なし）', { pending: '期限切れ・IP 違い',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: false, failures: 0, slack: [] } }],
  ['接続元が分からないまま（保存も要求も）→ 通す', { pending: '接続元なし',
    expected: { status: 200, body: SUCCESS, mfaCookie: '消す', sessionCookie: true, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン'] } }],
  ['期限切れで、途中の状態を消せない（InfraError）→ それでも 401 mfa_expired', { pending: '期限切れ', pendingDelete: 'InfraError',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: true, finalized: false, failures: 1, slack: [] } }],
  ['期限切れで、途中の状態を消せない（InfraError 以外）→ それでも 401 mfa_expired', { pending: '期限切れ', pendingDelete: 'Error',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: true, finalized: false, failures: 1, slack: [] } }],

  // --- 失敗の回数・同時の試行
  ['止まっている → 429、コードを Firebase に送らない', { pre: 3,
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: false, failures: 3, slack: [] } }],
  ['同時の試行で札が埋まっている → 429 attempt_in_progress', { pre: '札が埋まっている',
    expected: { status: 429, body: { error: 'attempt_in_progress', retryAfterSeconds: 1 }, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: false, failures: 1, slack: [] } }],

  // --- コードの確認
  ['コードが違う → 401 invalid_code、途中の状態は残り、失敗に数える', { finalize: '誤',
    expected: { status: 401, body: { error: 'invalid_code' }, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: true, failures: 2, slack: [] } }],
  ['コードが違って3回目 → 401 invalid_code、止め始めて Slack', { pre: 2, finalize: '誤',
    expected: { status: 401, body: { error: 'invalid_code' }, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: true, failures: 3, slack: ['ログイン制限', 'ログイン制限'] } }],
  ['Firebase がコードの期限切れを返した → 401 mfa_expired、数えない', { finalize: '期限切れ',
    expected: { status: 401, body: EXPIRED, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: true, failures: 1, slack: [] } }],
  ['Firebase が止めた → 429（こちらはまだ止めていない: 60秒）、失敗に数える', { finalize: 'throttled',
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: true, failures: 2, slack: [] } }],
  ['Firebase が止め、こちらも止め始めた → 429（こちらの止める時間）', { pre: 2, finalize: 'throttled',
    expected: { status: 429, body: TOO_MANY, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: true, failures: 3, slack: ['ログイン制限', 'ログイン制限'] },
    note: '止める時間（1分）が 60秒なので、本文は Firebase の既定と同じ値になる' }],
  ['コードの確認の障害 → 503、数えない、途中の状態は残る', { finalize: '障害',
    expected: { status: 503, body: { error: 'internal server error' }, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: true, finalized: true, failures: 1, slack: ['ALERT'] } }],

  // --- コードが合った後
  ['ID トークンが無効 → 401 login_failed、Slack にコード', { idToken: '無効',
    expected: { status: 401, body: { error: 'login_failed' }, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン拒否'], slackAccount: EMAIL } }],
  ['ID トークンの確認の障害 → 503', { idToken: '障害',
    expected: { status: 503, body: { error: 'server error' }, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ALERT'] },
    note: 'F-02（途中の状態は消えたが、Cookie は残る）' }],
  ['2要素目を通っていない → 403 no_second_factor', { secondFactor: 'なし',
    expected: { status: 403, body: { error: 'no_second_factor' }, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン拒否'], slackAccount: EMAIL } }],
  ['2要素目を通っていない・トークンに email がない → Slack は途中の状態のアカウント', { secondFactor: 'なし', emailInToken: false,
    expected: { status: 403, body: { error: 'no_second_factor' }, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン拒否'], slackAccount: EMAIL } }],
  ['Linux → 403 client_not_allowed', { client: 'Linux',
    expected: { status: 403, body: { error: 'client_not_allowed' }, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン拒否'], slackAccount: EMAIL } }],
  ['Linux・トークンに email がない → Slack は途中の状態のアカウント', { client: 'Linux', emailInToken: false,
    expected: { status: 403, body: { error: 'client_not_allowed' }, mfaCookie: '消す', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ログイン拒否'], slackAccount: EMAIL } }],
  ['Session Cookie を作れない → 503', { session: '失敗',
    expected: { status: 503, body: { error: 'server error' }, mfaCookie: 'そのまま', sessionCookie: false, pendingLeft: false, finalized: true, failures: 0, slack: ['ALERT'] },
    note: 'F-02' }],
]

function request(row: Row) {
  const pending = row.pending ?? 'ok'
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': row.client === 'Linux' ? CHROME_LINUX : CHROME_WIN }
  if (pending !== 'Cookie なし') headers.cookie = `mfa_pending=${pending === '知らない ID' ? 'someone-else' : PENDING_ID}`
  if (pending !== '接続元なし') headers['x-forwarded-for'] = pending === 'IP 違い' || pending === '期限切れ・IP 違い' ? OTHER_IP : IP
  return new Request('http://localhost/api/auth/login/verify', { method: 'POST', headers, body: JSON.stringify({ code: '913274' }) })
}

const savePending = (ip: string | null, expiresAtMs: number) => pendings.save(PENDING_ID, {
  email: EMAIL, ip, mfaPendingCredential: 'cred', sessionInfo: 'session-info', phoneHint: '+81*******1234', expiresAtMs,
})

async function arrange(row: Row) {
  const pending = row.pending ?? 'ok'
  const ip = pending === '接続元なし' ? null : IP
  await savePending(ip, Date.now() + MFA_PENDING_TTL_MS)

  // 前の状態（コードの誤り）を、本物の verify で作る（途中の状態は残る）
  const pre = row.pre ?? 1
  const failures = pre === '札が埋まっている' ? 1 : pre
  vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'invalid_code', code: 'INVALID_CODE' } })
  const seed = new Request('http://localhost/api/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': CHROME_WIN, cookie: `mfa_pending=${PENDING_ID}`, ...(ip === null ? {} : { 'x-forwarded-for': ip }) },
    body: JSON.stringify({ code: '000000' }),
  })
  for (let i = 0; i < failures; i++) await POST(seed.clone())
  if (pre === '札が埋まっている') {
    // 失敗1回のとき、止める段（3回）までの残りは2枚。ほかの PC が2枚とも使っている
    const keys = [{ kind: 'email' as const, value: EMAIL }, { kind: 'ip' as const, value: ip ?? 'unknown' }]
    await throttle.acquire(keys, Date.now(), 'other-1')
    await throttle.acquire(keys, Date.now(), 'other-2')
  }

  if (pending === '期限切れ' || pending === '期限切れ・IP 違い') await savePending(ip, Date.now() - 1)
  if (row.pendingDelete === 'InfraError') vi.spyOn(pendings, 'delete').mockRejectedValueOnce(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
  if (row.pendingDelete === 'Error') vi.spyOn(pendings, 'delete').mockRejectedValueOnce(new Error('boom'))

  const finalize = row.finalize ?? '正'
  if (finalize === '正') vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: true, value: { idToken: 'id-token-mfa' } })
  if (finalize === '誤') vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'invalid_code', code: 'INVALID_CODE' } })
  if (finalize === '期限切れ') vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'expired', code: 'SESSION_EXPIRED' } })
  if (finalize === 'throttled') vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'throttled', code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
  if (finalize === '障害') vi.mocked(finalizePhoneMfa).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in finalize failed: INTERNAL_ERROR (status 500)'))

  const decoded = {
    uid: 'uid-1', auth_time: 1_700_000_000,
    ...(row.emailInToken === false ? {} : { email: EMAIL }),
    firebase: row.secondFactor === 'なし' ? { sign_in_provider: 'password' } : { sign_in_second_factor: 'phone' },
  }
  const idToken = row.idToken ?? '有効'
  if (idToken === '有効') vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(decoded as never)
  if (idToken === '無効') vi.mocked(adminAuth.verifyIdToken).mockRejectedValue({ code: 'auth/user-disabled', message: 'disabled' })
  if (idToken === '障害') vi.mocked(adminAuth.verifyIdToken).mockRejectedValue(new Error('socket hang up'))
  vi.mocked(adminAuth.getUser).mockResolvedValue({ customClaims: undefined } as never)
  vi.mocked(adminAuth.setCustomUserClaims).mockResolvedValue(undefined)
  if ((row.session ?? 'ok') === 'ok') vi.mocked(adminAuth.createSessionCookie).mockResolvedValue('session-cookie-value')
  else vi.mocked(adminAuth.createSessionCookie).mockRejectedValue(new Error('internal-error'))

  vi.mocked(notifySlackFireAndForget).mockClear()
  vi.mocked(finalizePhoneMfa).mockClear()
}

describe('/api/auth/login/verify のデシジョンテーブル', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    throttle.clear(); pendings.clear()
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(ROWS)('%s', async (_name, row) => {
    await arrange(row)
    const response = await POST(request(row))
    const e = row.expected

    expect(response.status).toBe(e.status)
    expect(await response.json()).toEqual(e.body)

    const mfaCookie = response.cookies.get('mfa_pending')
    if (e.mfaCookie === '消す') expect(response.headers.get('set-cookie')).toMatch(/mfa_pending=;.*Max-Age=0/i)
    else expect(mfaCookie).toBeUndefined()
    expect(response.cookies.get('session')?.value).toBe(e.sessionCookie ? 'session-cookie-value' : undefined)

    expect(pendings.items.has(PENDING_ID)).toBe(e.pendingLeft)
    expect(vi.mocked(finalizePhoneMfa).mock.calls.length).toBe(e.finalized ? 1 : 0)

    const requestIp = row.pending === '接続元なし' ? 'unknown' : row.pending === 'IP 違い' || row.pending === '期限切れ・IP 違い' ? OTHER_IP : IP
    expect(throttle.states.get(`ip:${requestIp}`)?.failures ?? 0).toBe(e.failures)
    // メールアドレスの回数は、途中の状態を信じて数えたときだけ見る（接続元が違えば、メールアドレスは使わない）
    if (requestIp !== OTHER_IP) expect(throttle.states.get(`email:${EMAIL}`)?.failures ?? 0).toBe(e.failures)

    const messages = vi.mocked(notifySlackFireAndForget).mock.calls.map(([m]) => String(m))
    expect(messages.map((m) => /^\[([^\]]+)\]/.exec(m)?.[1])).toEqual(e.slack)
    if (e.slackAccount !== undefined) expect(messages[0]).toMatch(new RegExp(`^\\[ログイン拒否\\] ${e.slackAccount.replace(/[.()（）]/g, '\\$&')} / `))
  })
})
