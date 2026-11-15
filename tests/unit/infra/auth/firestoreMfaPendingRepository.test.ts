// @vitest-environment node
// 読み取りの検証（本物の読み書きは tests/emulator/mfaPending.test.ts）
import { describe, it, expect, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

vi.mock('@/lib/firebase/admin', () => ({ adminDb: {}, adminAuth: {} }))
import { mfaPendingDocId, toMfaPending } from '@/infra/auth/firestoreMfaPendingRepository'

const STORED = {
  email: 'pc1@example.com', ip: '203.0.113.5', mfaPendingCredential: 'p', sessionInfo: 's', phoneHint: '+81***',
  expireAt: Timestamp.fromMillis(1_800_000_000_000),
}

describe('toMfaPending', () => {
  it('正しい形なら expiresAtMs に直して返す', () => {
    expect(toMfaPending(STORED)).toEqual({
      email: 'pc1@example.com', ip: '203.0.113.5', mfaPendingCredential: 'p', sessionInfo: 's', phoneHint: '+81***', expiresAtMs: 1_800_000_000_000,
    })
  })
  it.each([
    ['null', null],
    ['期限がない', { ...STORED, expireAt: undefined }],
    ['期限が数値', { ...STORED, expireAt: 1 }],
    ['sessionInfo が空', { ...STORED, sessionInfo: '' }],
    ['ip が数値', { ...STORED, ip: 1 }],
  ])('%s は null（期限切れとして扱う）', (_label, data) => {
    expect(toMfaPending(data)).toBeNull()
  })
})

describe('mfaPendingDocId', () => {
  it('Cookie の値そのものを ID にしない', () => {
    const id = 'cookie-value-abc'
    expect(mfaPendingDocId(id)).toMatch(/^[0-9a-f]{64}$/)
    expect(mfaPendingDocId(id)).not.toContain(id)
  })
})
