import { describe, it, expect } from 'vitest'
import { monthlyTarget } from '@/components/aTaxTable/ATaxTable'
import { isATaxTableMonth } from '@/lib/aTaxMonths'

describe('宿泊税テーブルの対象月（今月・先月）', () => {
  it.each([
    ['2026-05-20', { targetYear: 2026, targetMonth: 5, currentLabel: '5月' }, { targetYear: 2026, targetMonth: 4, previousLabel: '4月' }],
    ['2026-01-01', { targetYear: 2026, targetMonth: 1, currentLabel: '1月' }, { targetYear: 2025, targetMonth: 12, previousLabel: '12月' }],
  ] as const)('今日（JST）が %s', (today, current, previous) => {
    expect(monthlyTarget('current', today)).toMatchObject(current)
    expect(monthlyTarget('previous', today)).toMatchObject(previous)
  })
})

describe('API が受け付ける月（isATaxTableMonth）', () => {
  it.each([
    // 今日（JST）, 受け付ける月, 受け付けない月
    ['2026-05-20', [[2026, 5], [2026, 4]], [[2026, 3], [2026, 6], [2025, 5]]],
    ['2026-01-01', [[2026, 1], [2025, 12]], [[2025, 11], [2026, 2], [2026, 12]]],
    ['2026-03-31', [[2026, 3], [2026, 2]], [[2026, 4], [2026, 1]]],
  ] as const)('今日が %s', (today, ok, ng) => {
    for (const [year, month] of ok) expect(isATaxTableMonth({ year, month }, today)).toBe(true)
    for (const [year, month] of ng) expect(isATaxTableMonth({ year, month }, today)).toBe(false)
  })

  it('画面が送る月は、API がすべて受け付ける', () => {
    for (const today of ['2026-05-20', '2026-01-01', '2026-12-31']) {
      for (const option of ['current', 'previous'] as const) {
        const { targetYear, targetMonth } = monthlyTarget(option, today)
        expect(isATaxTableMonth({ year: targetYear, month: targetMonth }, today)).toBe(true)
      }
    }
  })
})
