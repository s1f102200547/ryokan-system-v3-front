// @vitest-environment node
// Firestore のトランザクションの失敗の分け方（本物の読み書きは tests/emulator/loginThrottle.test.ts）
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { runTransaction: vi.fn(), collection: () => ({ doc: (id: string) => ({ id }) }) },
  adminAuth: {},
}))
import { adminDb } from '@/lib/firebase/admin'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { InfraError } from '@/types/errors'

const KEYS = [{ kind: 'email' as const, value: 'pc1@example.com' }]

describe('firestoreLoginThrottleRepository.acquire', () => {
  beforeEach(() => { vi.mocked(adminDb.runTransaction).mockClear() })

  // 同時の大量送信でトランザクションがぶつかり合い、SDK がやり直しを諦めた（gRPC ABORTED = 10）。
  // 入力が原因なので 503 + ALERT にせず、「少し待って」（busy）にする（コードレビューの指摘 4）
  it('ぶつかり合い（ABORTED）は busy', async () => {
    vi.mocked(adminDb.runTransaction).mockRejectedValue({ code: 10, message: 'Transaction aborted' })
    expect(await firestoreLoginThrottleRepository.acquire(KEYS, Date.now(), 'id'))
      .toEqual({ success: false, error: { kind: 'busy', retryAfterMs: 1000 } })
  })

  it('それ以外の失敗（接続できない）は今までどおり InfraError（503・Slack）', async () => {
    vi.mocked(adminDb.runTransaction).mockRejectedValue({ code: 14, message: 'unavailable' })
    await expect(firestoreLoginThrottleRepository.acquire(KEYS, Date.now(), 'id')).rejects.toMatchObject({ code: 'FIRESTORE_UNAVAILABLE' })
    await expect(firestoreLoginThrottleRepository.acquire(KEYS, Date.now(), 'id')).rejects.toBeInstanceOf(InfraError)
  })
})
