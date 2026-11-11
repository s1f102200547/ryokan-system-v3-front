// @vitest-environment node
// バグハンティング（2026-11-11）: ログインの失敗回数の制限を、状態遷移のモデルベース PBT で確かめる。
// 間違い・成功・Firebase の障害・時間の経過をランダムな順で起こし、単純に書き直した模範（MODEL）と結果が一致し続けるか
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/auth/passwordSignIn', () => ({ signInWithPassword: vi.fn(), isPasswordSignInConfigured: () => true }))
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { signInWithPassword } from '@/infra/auth/passwordSignIn'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { loginWithPasswordCommand } from '@/application/auth/loginWithPasswordCommand'
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
  | { op: 'right' }
  | { op: 'outage' }
  | { op: 'throttled' } // Firebase 自身が止めた（失敗として数える）
  | { op: 'wait'; ms: number }

const step: fc.Arbitrary<Step> = fc.oneof(
  { arbitrary: fc.constant({ op: 'wrong' as const }), weight: 5 },
  { arbitrary: fc.constant({ op: 'right' as const }), weight: 1 },
  { arbitrary: fc.constant({ op: 'outage' as const }), weight: 1 },
  { arbitrary: fc.constant({ op: 'throttled' as const }), weight: 1 },
  { arbitrary: fc.integer({ min: 1, max: 26 * H }).map((ms) => ({ op: 'wait' as const, ms })), weight: 2 },
)

beforeEach(() => throttle.clear())

describe('loginWithPasswordCommand（1つのメールアドレス・1つの IP）', () => {
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
        if (s.op === 'wrong') vi.mocked(signInWithPassword).mockResolvedValue({ success: false, error: { kind: 'invalid_credentials', code: 'INVALID_LOGIN_CREDENTIALS' } })
        if (s.op === 'throttled') vi.mocked(signInWithPassword).mockResolvedValue({ success: false, error: { kind: 'firebase_throttled', code: 'TOO_MANY_ATTEMPTS_TRY_LATER' } })
        if (s.op === 'right') vi.mocked(signInWithPassword).mockResolvedValue({ success: true, value: { idToken: 't' } })
        if (s.op === 'outage') vi.mocked(signInWithPassword).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'down'))

        const actual = await loginWithPasswordCommand({ email: 'pc1@example.com', password: 'pw1', ip: '203.0.113.5', nowMs: now })
          .then((r) => (r.success ? 'ok' : r.error.kind === 'rate_limited' ? `429:${r.error.retryAfterMs}` : '401'), () => '503')

        // 模範
        let expected: string
        const wasLocked = now < lockedUntil
        if (wasLocked) {
          expected = `429:${lockedUntil - now}`
        } else if (s.op === 'outage') {
          expected = '503' // 確かめられなかったので数えない
        } else if (s.op === 'right') {
          failures = 0; lockedUntil = 0
          expected = 'ok'
        } else {
          // wrong と throttled は、どちらも失敗として数える
          if (now - lastFailureAt >= 24 * H) failures = 0
          failures += 1
          lastFailureAt = now
          lockedUntil = modelLockMs(failures) > 0 ? now + modelLockMs(failures) : 0
          expected = s.op === 'wrong' ? '401' : `429:${modelLockMs(failures) > 0 ? modelLockMs(failures) : 60_000}`
        }
        expect(actual, JSON.stringify({ s, now, failures })).toBe(expected)
        // 止めている間は Firebase に送らない
        if (wasLocked) expect(signInWithPassword).not.toHaveBeenCalled()
      }
    }), { numRuns: 300 })
  })

  it('Firebase の障害が何回続いても、スタッフは止められない', async () => {
    vi.mocked(signInWithPassword).mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'down'))
    const now = Date.parse('2026-05-20T01:00:00Z')
    for (let i = 0; i < 10; i++) {
      await expect(loginWithPasswordCommand({ email: 'pc1@example.com', password: 'pw1', ip: '203.0.113.5', nowMs: now + i })).rejects.toThrow(InfraError)
    }
    vi.mocked(signInWithPassword).mockResolvedValue({ success: true, value: { idToken: 't' } })
    expect((await loginWithPasswordCommand({ email: 'pc1@example.com', password: 'pw1', ip: '203.0.113.5', nowMs: now + 10 })).success).toBe(true)
  })
})
