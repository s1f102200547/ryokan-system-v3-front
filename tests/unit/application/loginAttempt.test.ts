// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InfraError } from '@/types/errors'

// 回数の記録（札を外して結果を確定させる）が失敗したとき（src/application/auth/loginAttempt.ts。docs/MfaBugHunt.md の S9）。
// 応答は変えず（0 を返す）、ログと Slack に残す。InfraError でない例外も同じに扱う
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', () => ({
  firestoreLoginThrottleRepository: { read: vi.fn(), acquire: vi.fn(), complete: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { finishAttempt, throttleKeys } from '@/application/auth/loginAttempt'

describe('finishAttempt の記録の失敗', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['InfraError', new InfraError('FIRESTORE_UNAVAILABLE', 'down'), 'FIRESTORE_UNAVAILABLE'],
    ['InfraError でない例外', new Error('boom'), 'UNKNOWN'],
  ])('%s → 0 を返し、Slack にコードと結果を出す', async (_label, error, code) => {
    vi.mocked(firestoreLoginThrottleRepository.complete).mockRejectedValue(error)
    expect(await finishAttempt(throttleKeys('pc1@example.com', null), 'a1', 'failure', 0)).toBe(0)
    expect(notifySlackFireAndForget).toHaveBeenCalledWith(`[ALERT] ログインの回数の記録に失敗(${code})。結果: failure`)
  })
})
