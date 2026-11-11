import { recordFailure, type ThrottleState } from '@/domain/auth/loginThrottle'
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
    async recordFailure(keys, nowMs) {
      return keys.map((key) => {
        const { next, lockMs } = recordFailure(states.get(id(key)) ?? null, nowMs)
        states.set(id(key), next)
        return { lockMs, failures: next.failures }
      })
    },
    async reset(keys) {
      for (const key of keys) states.delete(id(key))
    },
  }
}
