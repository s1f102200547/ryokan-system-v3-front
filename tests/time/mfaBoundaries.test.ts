// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'

// SMS の2要素目と時間帯制限の、時刻の境界（docs/MfaBugHunt.md の S6）。npm run test:tz で3つの TZ で流す。
// 既存: 分の単位の境目は loginBusinessHours.test.ts・apiBusinessHours.test.ts・sessionExpiry.test.ts。
// ここでは、ミリ秒の境目、1段目と2段目が 23:00 をまたぐとき、Session Cookie の寿命と API の時間帯の組み合わせ、JST の日付の境目を見る

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    getUser: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    createSessionCookie: vi.fn().mockResolvedValue('cookie'),
  },
  adminDb: {},
}))
vi.mock('@/infra/auth/passwordSignIn', () => ({
  signInWithPassword: vi.fn().mockResolvedValue({ success: true, value: { kind: 'mfa_required', mfaPendingCredential: 'p', mfaEnrollmentId: 'e', phoneHint: '+81***' } }),
  isPasswordSignInConfigured: () => true,
}))
vi.mock('@/infra/auth/mfaSignIn', () => ({
  startPhoneMfa: vi.fn().mockResolvedValue({ success: true, value: { sessionInfo: 's' } }),
  finalizePhoneMfa: vi.fn().mockResolvedValue({ success: true, value: { idToken: 'id-token' } }),
}))
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/infra/auth/firestoreMfaPendingRepository', async () => {
  const { createMemoryMfaPendingRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreMfaPendingRepository: createMemoryMfaPendingRepository() }
})
vi.mock('@/infra/auth/firestoreSmsQuotaRepository', async () => {
  const { createMemorySmsQuotaRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreSmsQuotaRepository: createMemorySmsQuotaRepository() }
})
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { notifySlackFireAndForget } from '@/lib/slack'
import { finalizePhoneMfa, startPhoneMfa } from '@/infra/auth/mfaSignIn'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import type { createMemoryMfaPendingRepository } from '@tests/utils/memoryMfaRepositories'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { POST as VERIFY } from '@/app/api/auth/login/verify/route'
import { isOutsideApiHours, isOutsideBusinessHours } from '@/lib/businessHours'
import { MFA_PENDING_TTL_MS } from '@/constants/auth'

const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const MIN = 60 * 1000
const DECODED = { uid: 'uid-1', email: 'pc1@example.com', auth_time: 1_700_000_000, firebase: { sign_in_second_factor: 'phone' } }

// JST の日時（秒・ミリ秒まで）を、実行環境の TZ に関係なく同じ瞬間として返す
const jst = (iso: string) => Date.parse(`${iso}+09:00`)
const at = (iso: string) => vi.setSystemTime(jst(iso))

const login = () => LOGIN(new Request('http://localhost/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': WINDOWS_CHROME },
  body: JSON.stringify({ email: 'pc1@example.com', password: 'pw1' }),
}))
const verify = (pendingId: string) => VERIFY(new Request('http://localhost/api/auth/login/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': WINDOWS_CHROME, cookie: `mfa_pending=${pendingId}` },
  body: JSON.stringify({ code: '123456' }),
}))
async function verifyWithFreshPending(): Promise<Response> {
  await pendings.save('pending-1', {
    email: 'pc1@example.com', ip: null, mfaPendingCredential: 'p', sessionInfo: 's', phoneHint: '', expiresAtMs: Date.now() + MFA_PENDING_TTL_MS,
  })
  return verify('pending-1')
}

describe('SMS の2要素目の時刻の境界', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendings.clear()
    vi.useFakeTimers()
    vi.stubEnv('NODE_ENV', 'production')
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(DECODED as never)
    vi.mocked(adminAuth.getUser).mockResolvedValue({ customClaims: undefined } as never)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([
    ['05:59:59.999', 403], ['06:00:00.000', 200], ['22:59:59.999', 200], ['23:00:00.000', 403],
  ] as const)('ログインの1段目・2段目: JST %s → %i（ミリ秒の境目）', async (time, status) => {
    at(`2026-05-20T${time}`)
    expect((await login()).status).toBe(status)
    expect((await verifyWithFreshPending()).status).toBe(status)
  })

  it.each([
    ['05:59:59.999', true], ['06:00:00.000', false], ['23:04:59.999', false], ['23:05:00.000', true],
  ] as const)('ログイン以外の API: JST %s → 時間外: %s（ミリ秒の境目）', (time, outside) => {
    expect(isOutsideApiHours(jst(`2026-05-20T${time}`))).toBe(outside)
  })

  // 22:59 にパスワードを通すと SMS は届くが、23:00 を過ぎたコードは断る。途中の状態は期限（5分）まで残る
  it('1段目が 22:59:59、2段目が 23:00:01 → SMS は送ったが、コードは 403 outside_business_hours（コードを確かめない）', async () => {
    at('2026-05-20T22:59:59.000')
    const first = await login()
    expect(first.status).toBe(200)
    expect(startPhoneMfa).toHaveBeenCalledTimes(1)
    const pendingId = first.cookies.get('mfa_pending')?.value ?? ''

    at('2026-05-20T23:00:01.000')
    const second = await verify(pendingId)
    expect(second.status).toBe(403)
    expect(await second.json()).toEqual({ error: 'outside_business_hours' })
    expect(finalizePhoneMfa).not.toHaveBeenCalled()
    expect(adminAuth.createSessionCookie).not.toHaveBeenCalled()
    expect(pendings.items.size).toBe(1) // 消さない（期限で消える）
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  // Session Cookie は当日 23:00 まで（最短5分）。22:55 以降のログインは最長 23:05 まで生き、ほかの API の時間帯（23:05 まで）に収まる
  it('6:00〜23:00 のどのミリ秒に Session Cookie を出しても、寿命は 5分以上で、23:00（22:55 以降は 23:05）までに切れ、ほかの API の時間帯に収まる', async () => {
    const open = jst('2026-05-20T06:00:00.000')
    const close = jst('2026-05-20T23:00:00.000')
    const apiClose = jst('2026-05-20T23:05:00.000')
    await fc.assert(fc.asyncProperty(fc.integer({ min: open, max: close - 1 }), async (nowMs) => {
      vi.setSystemTime(nowMs)
      vi.mocked(adminAuth.createSessionCookie).mockClear()
      const res = await verifyWithFreshPending()
      expect(res.status).toBe(200)
      const expiresIn = vi.mocked(adminAuth.createSessionCookie).mock.calls[0][1].expiresIn
      const endMs = nowMs + expiresIn
      expect(expiresIn).toBeGreaterThanOrEqual(5 * MIN)
      expect(endMs).toBe(Math.max(close, nowMs + 5 * MIN))
      expect(endMs).toBeLessThanOrEqual(apiClose)
      expect(isOutsideApiHours(endMs - 1)).toBe(false) // 切れる直前まで、ほかの API を使える
      // ブラウザが Cookie を消す時刻（Max-Age は秒の切り捨て）は、サーバーの期限より後にならない
      const maxAge = Number(/session=cookie;[^\n]*?Max-Age=(\d+)/i.exec(res.headers.get('set-cookie') ?? '')?.[1])
      expect(maxAge * 1000).toBeLessThanOrEqual(expiresIn)
      expect(maxAge * 1000).toBeGreaterThan(expiresIn - 1000)
    }), { numRuns: 200 })
  })

  it('画面の時間帯（23:00 まで）と、ほかの API の時間帯（23:05 まで）の差は、その5分だけ', () => {
    for (let m = 0; m < 24 * 60; m++) {
      const t = jst('2026-05-20T00:00:00.000') + m * MIN
      const inGrace = t >= jst('2026-05-20T23:00:00.000') && t < jst('2026-05-20T23:05:00.000')
      expect(isOutsideApiHours(t)).toBe(isOutsideBusinessHours(t) && !inGrace)
    }
  })

  // 1アカウント1セッション: 前のログインが今日（JST）なら「前のセッションを切った」と Slack に書く。JST の日付の境目
  it.each([
    ['今日の 0:00:00（JST）', '2026-05-20T00:00:00', true],
    ['昨日の 23:59:59（JST）', '2026-05-19T23:59:59', false],
  ])('前のログインが %s → 「前のセッションを切った」: %s', async (_label, previousIso, replaced) => {
    at('2026-05-20T12:00:00.000')
    vi.mocked(adminAuth.getUser).mockResolvedValue({ customClaims: { sessionAuthTime: jst(previousIso) / 1000 } } as never)
    expect((await verifyWithFreshPending()).status).toBe(200)
    const message = String(vi.mocked(notifySlackFireAndForget).mock.calls[0][0])
    expect(message.endsWith(' / 前のセッションを切った')).toBe(replaced)
  })
})
