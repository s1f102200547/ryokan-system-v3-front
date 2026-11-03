// PBT: 日付計算の性質。tests/time/ にあるので npm run test:tz で3つの TZ で実行される
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { addDays, dateDiff, toMonthDay } from '@/lib/dateUtils'
import { isoDate } from '@tests/utils/arbitraries'

const days = fc.integer({ min: -2000, max: 2000 })

describe('日付計算の性質', () => {
  it('dateDiff(a, addDays(a, n)) === n', () => {
    fc.assert(fc.property(isoDate, days, (a, n) => dateDiff(a, addDays(a, n)) === n), { numRuns: 2000 })
  })

  it('addDays(addDays(a, m), n) === addDays(a, m + n)', () => {
    fc.assert(fc.property(isoDate, days, days, (a, m, n) => addDays(addDays(a, m), n) === addDays(a, m + n)), { numRuns: 1000 })
  })

  it('addDays の結果は実在する YYYY-MM-DD', () => {
    fc.assert(fc.property(isoDate, days, (a, n) => {
      const d = addDays(a, n)
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10)).toBe(d)
    }), { numRuns: 1000 })
  })

  it('toMonthDay は日付の月日（0 埋めなし）', () => {
    fc.assert(fc.property(isoDate, (a) => {
      const [, m, d] = a.split('-').map(Number)
      expect(toMonthDay(a)).toEqual({ month: String(m), day: String(d) })
    }))
  })
})
