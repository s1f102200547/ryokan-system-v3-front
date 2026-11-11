import { acquireAttempt, refundFailure, type ThrottleState } from '@/domain/auth/loginThrottle'
import type { LoginThrottleRepository, ThrottleKey } from '@/domain/ports/loginThrottleRepository'

// firestoreLoginThrottleRepository の代わりに、メモリで数える（判定は本物の domain の関数）。
// vi.mock('@/infra/auth/firestoreLoginThrottleRepository', ...) の中で使う
export function createMemoryLoginThrottleRepository(): LoginThrottleRepository & { states: Map<string, ThrottleState>; clear(): void } {
  const states = new Map<string, ThrottleState>()
  const id = (key: ThrottleKey) => `${key.kind}:${key.kind === 'email' ? key.value.trim().toLowerCase() : key.value}`
  return {
    states,
    clear: () => states.clear(),
    async read(keys) {
      return keys.map((key) => states.get(id(key)) ?? null)
    },
    // Firestore のトランザクションと同じく、読んでから書くまでを割り込みなしで行う（await を挟まない）
    async acquire(keys, nowMs) {
      const attempts = keys.map((key) => acquireAttempt(states.get(id(key)) ?? null, nowMs))
      const retryAfterMs = Math.max(0, ...attempts.map((a) => (a.success ? 0 : a.error.retryAfterMs)))
      if (retryAfterMs > 0) return { success: false, error: { retryAfterMs } }
      return {
        success: true,
        value: keys.map((key, i) => {
          const attempt = attempts[i]
          if (!attempt.success) throw new Error('unreachable')
          const previous = states.get(id(key)) ?? null
          states.set(id(key), attempt.value.next)
          return { lockMs: attempt.value.lockMs, failures: attempt.value.next.failures, previous }
        }),
      }
    },
    async refund(keys, acquired, nowMs) {
      for (const [i, key] of keys.entries()) {
        const next = refundFailure(states.get(id(key)) ?? null, acquired[i]?.previous ?? null, nowMs)
        if (next === null) states.delete(id(key))
        else states.set(id(key), next)
      }
    },
    async reset(keys) {
      for (const key of keys) states.delete(id(key))
    },
  }
}
