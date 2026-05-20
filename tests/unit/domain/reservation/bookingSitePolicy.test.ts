import { describe, it, expect } from 'vitest'
import { isATaxExempt, calcATax } from '@/domain/reservation/bookingSitePolicy'

describe('isATaxExempt', () => {
  it('chillnn は免税', () => {
    expect(isATaxExempt('chillnn')).toBe(true)
  })

  it('booking.com は課税', () => {
    expect(isATaxExempt('booking.com')).toBe(false)
  })

  it('expedia は課税', () => {
    expect(isATaxExempt('expedia')).toBe(false)
  })

  it('other は課税', () => {
    expect(isATaxExempt('other')).toBe(false)
  })
})

describe('calcATax', () => {
  it('2人 × 3泊 × 200円 = 1200円', () => {
    expect(calcATax(2, 3, 200)).toBe(1200)
  })

  it('1人 × 1泊 × 200円 = 200円', () => {
    expect(calcATax(1, 1, 200)).toBe(200)
  })

  it('adult_count=0 のとき 0円', () => {
    expect(calcATax(0, 3, 200)).toBe(0)
  })
})
