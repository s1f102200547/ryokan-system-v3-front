// @vitest-environment node
// バグハンティング（2026-11-11）: ログインの失敗回数の制限を、状態遷移のモデルベース PBT で確かめる。
// 間違い・成功・Firebase の障害・時間の経過をランダムな順で起こし、単純に書き直した模範（MODEL）と結果が一致し続けるか。
// SMS の2要素目（C）を足してから: パスワードとコードを同じ key・同じ表で数え、0 に戻すのはコードが合ったときだけ
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/auth/passwordSignIn', () => ({ signInWithPassword: vi.fn(), isPasswordSignInConfigured: () => true }))
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/infra/auth/mfaSignIn', () => ({ finalizePhoneMfa: vi.fn(), startPhoneMfa: vi.fn() }))
vi.mock('@/infra/auth/firestoreMfaPendingRepository', async () => {
  const { createMemoryMfaPendingRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreMfaPendingRepository: createMemoryMfaPendingRepository() }
})
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { signInWithPassword } from '@/infra/auth/passwordSignIn'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { loginWithPasswordCommand } from '@/application/auth/loginWithPasswordCommand'
import { verifyMfaCodeCommand } from '@/application/auth/verifyMfaCodeCommand'
import { finalizePhoneMfa } from '@/infra/auth/mfaSignIn'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'

const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const MIN = 60_000
const H = 60 * MIN

// 模範: 表をそのまま書く（実装の lockDurationMs を使わない）
function modelLockMs(failures: number): number {
  if (failures >= 6) return 60 * MIN
  return ({ 3: 1 * MIN, 4: 5 * MIN, 5: 15 * MIN } as Record<number, number>)[failures] ?? 0
}

type Step =
  | { op: 'wrong' }
  | { op: 'right' }      // パスワードが合った（2要素目が残っている）
  | { op: 'codeRight' }  // SMS のコードが合った（ログインが最後まで通った）
  | { op: 'codeWrong' }
  | { op: 'outage' }
  | { op: 'throttled' } // Firebase 自身が止めた（失敗として数える）
  | { op: 'wait'; ms: number }

const step: fc.Arbitrary<Step> = fc.oneof(
  { arbitrary: fc.constant({ op: 'wrong' as const }), weight: 5 },
  { arbitrary: fc.constant({ op: 'right' as const }), weight: 1 },
  { arbitrary: fc.constant({ op: 'codeRight' as const }), weight: 1 },
  { arbitrary: fc.constant({ op: 'codeWrong' as const }), weight: 3 },
  { arbitrary: fc.constant({ op: 'outage' as const }), weight: 1 },
  { arbitrary: fc.constant({ op: 'throttled' as const }), weight: 1 },
  { arbitrary: fc.integer({ min: 1, max: 26 * H }).map((ms) => ({ op: 'wait' as const, ms })), weight: 2 },
)

beforeEach(() => throttle.clear())

const EMAIL = 'pc1@example.com'
const IP = '203.0.113.5'

// コードの確認。途中の状態は毎回置き直す（期限切れは別のテストで見る）
async function verifyCode(nowMs: number) {
  await firestoreMfaPendingRepository.save('pending-1', {
    email: EMAIL, ip: IP, mfaPendingCredential: 'pc', sessionInfo: 'si', phoneHint: '+81***', expiresAtMs: nowMs + 60_000,
  })
  return verifyMfaCodeCommand({ pendingId: 'pending-1', code: '123456', ip: IP, nowMs })
}

describe('loginWithPasswordCommand と verifyMfaCodeCommand（1つのメールアドレス・1つの IP）', () => {
  it('どんな順で起きても、模範と同じ結果になる', async () => {
    await fc.assert(fc.asyncProperty(fc.array(step, { maxLength: 40 }), async (steps) => {
      throttle.clear()
      let now = Date.parse('2026-05-20T01:00:00Z')
      // 模範の状態
      let failures = 0
      let lastFailureAt = -Infinity
      let lockedUntil = 0

      for (const s of steps) {
        if (s.op === 'wait') { now += s.ms; continue }
        vi.mocked(signInWithPassword).mockReset()
        vi.mocked(finalizePhoneMfa).mockReset()
        if (s.op === 'codeRight') vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: true, value: { idToken: 't' } })
        if (s.op === 'codeWrong') vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'invalid_code', code: 'INVALID_CODE' } })
        if (s.op === 'wrong') vi.mocked(signInWithPassword).mockResolvedValue({ success: false, error: { kind: 'invalid_credentials', code: 'INVALID_LOGIN_CREDENTIALS' } })
        if (s.op === 'throttled') vi.mocked(signInWithPassword).mockResolvedValue({ success: false, error: { kind: 'firebase_throttled', code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
        if (s.op === 'right') vi.mocked(signInWithPassword).mockResolvedValue({ success: true, value: { kind: 'signed_in', idToken: 't' } })
        if (s.op === 'outage') vi.mocked(signInWithPassword).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'down'))

        const isCode = s.op === 'codeRight' || s.op === 'codeWrong'
        const run = isCode ? verifyCode(now) : loginWithPasswordCommand({ email: EMAIL, password: 'pw1', ip: IP, nowMs: now })
        const actual = await run
          .then((r) => (r.success ? 'ok' : r.error.kind === 'rate_limited' ? `429:${r.error.retryAfterMs}` : '401'), () => '503')

        // 模範
        let expected: string
        const wasLocked = now < lockedUntil
        if (wasLocked) {
          expected = `429:${lockedUntil - now}`
        } else if (s.op === 'outage') {
          expected = '503' // 確かめられなかったので数えない
        } else if (s.op === 'right') {
          expected = 'ok' // パスワードが合っただけでは 0 に戻さない
        } else if (s.op === 'codeRight') {
          failures = 0; lockedUntil = 0
          expected = 'ok'
        } else {
          // wrong・codeWrong・throttled は、どれも失敗として数える
          if (now - lastFailureAt >= 24 * H) failures = 0
          failures += 1
          lastFailureAt = now
          lockedUntil = modelLockMs(failures) > 0 ? now + modelLockMs(failures) : 0
          expected = s.op !== 'throttled' ? '401' : `429:${modelLockMs(failures) > 0 ? modelLockMs(failures) : 60_000}`
        }
        expect(actual, JSON.stringify({ s, now, failures })).toBe(expected)
        // 止めている間は Firebase に送らない
        if (wasLocked) {
          expect(signInWithPassword).not.toHaveBeenCalled()
          expect(finalizePhoneMfa).not.toHaveBeenCalled()
        }
      }
    }), { numRuns: 300 })
  })

  it('Firebase の障害が何回続いても、スタッフは止められない', async () => {
    vi.mocked(signInWithPassword).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'down'))
    const now = Date.parse('2026-05-20T01:00:00Z')
    for (let i = 0; i < 10; i++) {
      await expect(loginWithPasswordCommand({ email: EMAIL, password: 'pw1', ip: IP, nowMs: now + i })).rejects.toThrow(InfraError)
    }
    vi.mocked(signInWithPassword).mockResolvedValue({ success: true, value: { kind: 'signed_in', idToken: 't' } })
    expect((await loginWithPasswordCommand({ email: EMAIL, password: 'pw1', ip: IP, nowMs: now + 10 })).success).toBe(true)
  })
})

describe('パスワードを知る攻撃者が、パスワードとコードを繰り返す', () => {
  it('パスワードが合っても回数は減らず、コードの間違いで段の表どおりに止まる', async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ success: true, value: { kind: 'mfa_required', mfaPendingCredential: 'pc', mfaEnrollmentId: 'e', phoneHint: '+81***' } })
    vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: false, error: { kind: 'invalid_code', code: 'INVALID_CODE' } })
    const now = Date.parse('2026-05-20T01:00:00Z')
    const results: string[] = []
    for (let i = 0; i < 3; i++) {
      results.push((await loginWithPasswordCommand({ email: EMAIL, password: 'pw1', ip: IP, nowMs: now + i * 2 })).success ? 'pw-ok' : 'pw-ng')
      const r = await verifyCode(now + i * 2 + 1)
      results.push(r.success ? 'code-ok' : r.error.kind)
    }
    // 3回目のコードの間違いで1分止まり、次はパスワードも確かめない
    expect(results).toEqual(['pw-ok', 'invalid_code', 'pw-ok', 'invalid_code', 'pw-ok', 'invalid_code'])
    const next = await loginWithPasswordCommand({ email: EMAIL, password: 'pw1', ip: IP, nowMs: now + 10 })
    expect(next).toEqual({ success: false, error: { kind: 'rate_limited', retryAfterMs: 60_000 - 10 + 5 } })
  })
})
