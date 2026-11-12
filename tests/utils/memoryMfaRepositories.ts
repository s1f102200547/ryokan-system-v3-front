import { consumeSms, type SmsQuotaState } from '@/domain/auth/smsQuota'
import type { MfaPending } from '@/domain/auth/mfaPending'
import type { MfaPendingRepository } from '@/domain/ports/mfaPendingRepository'
import type { SmsQuotaRepository } from '@/domain/ports/smsQuotaRepository'

// firestoreMfaPendingRepository・firestoreSmsQuotaRepository の代わり。判定は本番と同じ domain の関数。
// vi.mock('@/infra/auth/firestoreMfaPendingRepository', ...) などの中で使う
export function createMemoryMfaPendingRepository(): MfaPendingRepository & { items: Map<string, MfaPending>; clear(): void } {
  const items = new Map<string, MfaPending>()
  return {
    items,
    clear: () => items.clear(),
    async save(id, pending) { items.set(id, pending) },
    async get(id) { return items.get(id) ?? null },
    async delete(id) { items.delete(id) },
  }
}

export function createMemorySmsQuotaRepository(): SmsQuotaRepository & { states: Map<string, SmsQuotaState>; clear(): void } {
  const states = new Map<string, SmsQuotaState>()
  return {
    states,
    clear: () => states.clear(),
    async consume(email, today) {
      const key = email.trim().toLowerCase()
      const decision = consumeSms(states.get(key) ?? null, today)
      states.set(key, decision.next)
      return decision
    },
  }
}
