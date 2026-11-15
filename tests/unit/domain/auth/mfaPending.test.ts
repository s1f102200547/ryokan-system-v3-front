import { describe, it, expect } from 'vitest'
import { checkMfaPending, type MfaPending } from '@/domain/auth/mfaPending'

const NOW = 1_800_000_000_000
const PENDING: MfaPending = {
  email: 'pc1@example.com', ip: '203.0.113.5', mfaPendingCredential: 'p', sessionInfo: 's', phoneHint: '+81***', expiresAtMs: NOW + 1,
}

describe('checkMfaPending', () => {
  it('期限内で同じ接続元なら通す', () => {
    expect(checkMfaPending(PENDING, '203.0.113.5', NOW)).toEqual({ success: true, value: PENDING })
  })
  it.each([
    ['ない', null, NOW],
    ['ちょうど期限', PENDING, NOW + 1],
    ['期限の後', PENDING, NOW + 60_000],
  ])('%s → expired', (_label, pending, nowMs) => {
    expect(checkMfaPending(pending, '203.0.113.5', nowMs)).toEqual({ success: false, error: 'expired' })
  })
  it.each([['198.51.100.1'], [null]])('接続元が違う（%s）→ ip_mismatch', (ip) => {
    expect(checkMfaPending(PENDING, ip, NOW)).toEqual({ success: false, error: 'ip_mismatch' })
  })
  it('接続元が分からないまま（null 同士）なら通す', () => {
    expect(checkMfaPending({ ...PENDING, ip: null }, null, NOW).success).toBe(true)
  })
})
