import { describe, it, expect } from 'vitest'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'

describe('infraErrorToStatus', () => {
  it.each([
    ['FIRESTORE_UNAVAILABLE', 503],
    ['FIRESTORE_PERMISSION', 500],
    ['FIRESTORE_DATA_CORRUPTION', 500],
    ['FIRESTORE_NOT_FOUND', 404],
    ['AUTH_FAILED', 401],
    ['AUTH_UNAVAILABLE', 503],
  ] as const)('%s は %i', (code, status) => {
    expect(infraErrorToStatus(code)).toBe(status)
  })
})
