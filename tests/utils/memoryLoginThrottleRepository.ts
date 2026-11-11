import { acquireAll, completeAttempt, type ThrottleState } from '@/domain/auth/loginThrottle'
import type { LoginThrottleRepository, ThrottleKey } from '@/domain/ports/loginThrottleRepository'

// firestoreLoginThrottleRepository の代わりに、メモリで数える。判定は本番と同じ domain の関数（acquireAll・completeAttempt）。
// Firestore のトランザクションと同じく、読んでから書くまでを割り込みなしで行う（await を挟まない）。
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
    async acquire(keys, nowMs, attemptId) {
      const result = acquireAll(keys.map((key) => states.get(id(key)) ?? null), nowMs, attemptId)
      if (!result.success) return result
      keys.forEach((key, i) => states.set(id(key), result.value[i]))
      return { success: true, value: undefined }
    },
    async complete(keys, attemptId, outcome, nowMs) {
      return keys.map((key) => {
        const { next, lockMs, failures } = completeAttempt(states.get(id(key)) ?? null, attemptId, outcome, nowMs)
        if (next === null) states.delete(id(key))
        else states.set(id(key), next)
        return { lockMs, failures }
      })
    },
  }
}
