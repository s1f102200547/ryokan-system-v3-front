import { describe, it, expect, vi, afterEach } from 'vitest'
import { addDays, dateDiff, getTodayJST, toMonthDay } from '@/lib/dateUtils'
import { setNowJST, JST_BOUNDARY_TIMES } from '@tests/utils/timeHelper'

// 月末・年末年始・閏日・米国の夏時間の切り替え日（2026-03-08 / 2026-11-01）
const DATES = ['2026-01-31', '2026-02-28', '2024-02-29', '2026-03-08', '2026-03-31', '2026-10-31', '2026-11-01', '2026-12-31']

describe('getTodayJST', () => {
  afterEach(() => vi.useRealTimers())

  it.each(JST_BOUNDARY_TIMES)('JST 2026-05-20 %s は 2026-05-20', (time) => {
    vi.useFakeTimers()
    setNowJST(`2026-05-20T${time}`)
    expect(getTodayJST()).toBe('2026-05-20')
  })
})

describe('addDays / dateDiff', () => {
  it.each(DATES)('%s から ±1・±30・±365 日', (date) => {
    for (const n of [-365, -30, -1, 0, 1, 30, 365]) {
      expect(dateDiff(date, addDays(date, n))).toBe(n)
    }
  })

  it.each([
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-03-07', 1, '2026-03-08'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-11-01', 1, '2026-11-02'],
  ] as const)('%s + %i = %s', (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected)
  })
})

describe('toMonthDay', () => {
  it.each([
    ['2026-05-20', { month: '5', day: '20' }],
    ['2026-01-01', { month: '1', day: '1' }],
    ['2026-12-31', { month: '12', day: '31' }],
  ] as const)('%s', (date, expected) => {
    expect(toMonthDay(date)).toEqual(expected)
  })
})
