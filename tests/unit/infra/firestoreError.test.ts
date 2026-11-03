import { describe, it, expect } from 'vitest'
import { toInfraError } from '@/infra/firestoreError'
import { InfraError } from '@/types/errors'

describe('toInfraError', () => {
  it.each([
    [14, 'FIRESTORE_UNAVAILABLE'],
    [7, 'FIRESTORE_PERMISSION'],
    // 存在しない ID への update() は入力が原因。障害（503 + ALERT）にしない
    [5, 'FIRESTORE_NOT_FOUND'],
    [13, 'FIRESTORE_UNAVAILABLE'],
  ])('gRPC code %i は %s', (code, expected) => {
    expect(toInfraError({ code, message: 'x' }).code).toBe(expected)
  })

  it('InfraError はそのまま', () => {
    const e = new InfraError('FIRESTORE_DATA_CORRUPTION', 'x')
    expect(toInfraError(e)).toBe(e)
  })

  // 原因が分からなくならないよう、元の例外を cause に残す
  it('元の例外を cause に残す', () => {
    const cause = new RangeError('Invalid array length')
    expect(toInfraError(cause).cause).toBe(cause)
  })
})
