// @vitest-environment node
// SMS の2要素目の Command（startMfaCommand・verifyMfaCodeCommand）。Firebase の REST はモック、保存はメモリ
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InfraError } from '@/types/errors'
import { setNowJST } from '@tests/utils/timeHelper'

vi.mock('@/infra/auth/mfaSignIn', () => ({ finalizePhoneMfa: vi.fn(), startPhoneMfa: vi.fn() }))
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
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { finalizePhoneMfa, startPhoneMfa } from '@/infra/auth/mfaSignIn'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { firestoreSmsQuotaRepository } from '@/infra/auth/firestoreSmsQuotaRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { logger } from '@/lib/logger'
import { startMfaCommand } from '@/application/auth/startMfaCommand'
import { verifyMfaCodeCommand } from '@/application/auth/verifyMfaCodeCommand'
import { MFA_PENDING_TTL_MS, MFA_SMS_DAILY_LIMIT } from '@/constants/auth'
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
import type { createMemoryMfaPendingRepository, createMemorySmsQuotaRepository } from '@tests/utils/memoryMfaRepositories'

const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>
const quota = firestoreSmsQuotaRepository as ReturnType<typeof createMemorySmsQuotaRepository>

const EMAIL = 'pc1@example.com'
const IP = '203.0.113.5'
const SECRET_PENDING = 'pending-cred-must-not-leak'
const SECRET_SESSION = 'session-info-must-not-leak'

beforeEach(() => {
  vi.useFakeTimers()
  setNowJST('2026-11-12T08:00')
  vi.clearAllMocks()
  throttle.clear(); pendings.clear(); quota.clear()
  vi.mocked(startPhoneMfa).mockResolvedValue({ success: true, value: { sessionInfo: SECRET_SESSION } })
})
afterEach(() => vi.useRealTimers())

const start = () => startMfaCommand({
  email: EMAIL, ip: IP, forwardedFor: IP, mfaPendingCredential: SECRET_PENDING, mfaEnrollmentId: 'phone-1', phoneHint: '+81***1234', recaptchaToken: 'recaptcha-token', nowMs: Date.now(),
})

// ログの引数にも Slack にも秘密の値が入っていない
function expectNoSecretsLogged() {
  const logged = JSON.stringify([vi.mocked(logger.warn).mock.calls, vi.mocked(logger.error).mock.calls, vi.mocked(notifySlackFireAndForget).mock.calls])
  for (const s of [SECRET_PENDING, SECRET_SESSION, '123456']) expect(logged).not.toContain(s)
}

describe('startMfaCommand', () => {
  it('SMS を送り、推測できない ID で途中の状態を保存する（5分）', async () => {
    const r = await start()
    if (!r.success) throw new Error('expected success')
    expect(r.value.phoneHint).toBe('+81***1234')
    expect(r.value.pendingId).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 バイト
    expect(startPhoneMfa).toHaveBeenCalledWith(SECRET_PENDING, 'phone-1', 'recaptcha-token')
    expect(pendings.items.get(r.value.pendingId)).toEqual({
      email: EMAIL, ip: IP, mfaPendingCredential: SECRET_PENDING, sessionInfo: SECRET_SESSION, phoneHint: '+81***1234',
      expiresAtMs: Date.now() + MFA_PENDING_TTL_MS,
    })
  })

  it('1日の上限を超えたら送らずに sms_limit。Slack は1回だけ', async () => {
    for (let i = 0; i < MFA_SMS_DAILY_LIMIT; i++) expect((await start()).success).toBe(true)
    expect(await start()).toEqual({ success: false, error: { kind: 'sms_limit' } })
    expect(await start()).toEqual({ success: false, error: { kind: 'sms_limit' } })
    expect(startPhoneMfa).toHaveBeenCalledTimes(MFA_SMS_DAILY_LIMIT)
    const notices = vi.mocked(notifySlackFireAndForget).mock.calls.map(([m]) => m).filter((m) => m.startsWith('[SMS 上限]'))
    expect(notices).toEqual([`[SMS 上限] ${EMAIL} / 今日 ${MFA_SMS_DAILY_LIMIT} 通を超えたので送らない / IP ${IP}（右端が Google の追記） / 11/12 08:00`])
  })

  it('次の日（JST）は数え直す', async () => {
    for (let i = 0; i <= MFA_SMS_DAILY_LIMIT; i++) await start()
    setNowJST('2026-11-13T06:00')
    expect((await start()).success).toBe(true)
  })

  it('Firebase が送信を止めたら sms_throttled。途中の状態は保存しない', async () => {
    vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'throttled', code: 'QUOTA_EXCEEDED' } })
    expect(await start()).toEqual({ success: false, error: { kind: 'sms_throttled', retryAfterMs: 60_000 } })
    expect(pendings.items.size).toBe(0)
    expectNoSecretsLogged()
  })

  it('reCAPTCHA の token を断られたら recaptcha_rejected。途中の状態は保存しない', async () => {
    vi.mocked(startPhoneMfa).mockResolvedValue({ success: false, error: { kind: 'recaptcha_rejected', code: 'INVALID_RECAPTCHA_TOKEN' } })
    expect(await start()).toEqual({ success: false, error: { kind: 'recaptcha_rejected' } })
    expect(pendings.items.size).toBe(0)
  })

  it('Firebase の障害はそのまま投げる（Route が 503・Slack）', async () => {
    vi.mocked(startPhoneMfa).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'down'))
    await expect(start()).rejects.toThrow(InfraError)
    expect(pendings.items.size).toBe(0)
  })
})

describe('verifyMfaCodeCommand', () => {
  async function startedPendingId(): Promise<string> {
    const r = await start()
    if (!r.success) throw new Error('expected success')
    return r.value.pendingId
  }
  const verify = (pendingId: string, ip: string | null = IP) => verifyMfaCodeCommand({ pendingId, code: '123456', ip, nowMs: Date.now() })

  it('コードが合えば idToken。途中の状態は消え、もう使えない。失敗の回数は 0 に戻る', async () => {
    const id = await startedPendingId()
    vi.mocked(finalizePhoneMfa).mockResolvedValueOnce({ success: false, error: { kind: 'invalid_code', code: 'INVALID_CODE' } })
    expect(await verify(id)).toEqual({ success: false, error: { kind: 'invalid_code' } })
    expect(throttle.states.size).toBe(2) // email と IP に1回ずつ

    vi.mocked(finalizePhoneMfa).mockResolvedValueOnce({ success: true, value: { idToken: 'id-token' } })
    expect(await verify(id)).toEqual({ success: true, value: { idToken: 'id-token', email: EMAIL } })
    expect(finalizePhoneMfa).toHaveBeenLastCalledWith(SECRET_PENDING, SECRET_SESSION, '123456')
    expect(pendings.items.size).toBe(0)
    expect(throttle.states.size).toBe(0)
    expect(await verify(id)).toEqual({ success: false, error: { kind: 'expired' } })
    expectNoSecretsLogged()
  })

  it('知らない ID・期限切れは expired（Firebase に送らない）', async () => {
    expect(await verify('unknown')).toEqual({ success: false, error: { kind: 'expired' } })
    const id = await startedPendingId()
    vi.setSystemTime(Date.now() + MFA_PENDING_TTL_MS)
    expect(await verify(id)).toEqual({ success: false, error: { kind: 'expired' } })
    expect(pendings.items.size).toBe(0)
    expect(finalizePhoneMfa).not.toHaveBeenCalled()
  })

  it('パスワードを確かめたときと接続元が違えば ip_mismatch。途中の状態を消す', async () => {
    const id = await startedPendingId()
    expect(await verify(id, '198.51.100.9')).toEqual({ success: false, error: { kind: 'ip_mismatch' } })
    expect(pendings.items.size).toBe(0)
    expect(finalizePhoneMfa).not.toHaveBeenCalled()
  })

  it('Firebase がコードの期限切れを返したら expired（数えない）', async () => {
    const id = await startedPendingId()
    vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'expired', code: 'SESSION_EXPIRED' } })
    expect(await verify(id)).toEqual({ success: false, error: { kind: 'expired' } })
    expect(pendings.items.size).toBe(0)
    expect(throttle.states.size).toBe(0)
  })

  it('Firebase の障害は数えずに投げる。途中の状態は残る（打ち直せる）', async () => {
    const id = await startedPendingId()
    vi.mocked(finalizePhoneMfa).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'down'))
    await expect(verify(id)).rejects.toThrow(InfraError)
    expect(throttle.states.size).toBe(0)
    expect(pendings.items.size).toBe(1)
  })

  it('Firebase 自身が止めたら、失敗として数えて rate_limited', async () => {
    const id = await startedPendingId()
    vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'throttled', code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
    expect(await verify(id)).toEqual({ success: false, error: { kind: 'rate_limited', retryAfterMs: 60_000 } })
    expect([...throttle.states.values()].every((s) => s.failures === 1)).toBe(true)
  })
})
