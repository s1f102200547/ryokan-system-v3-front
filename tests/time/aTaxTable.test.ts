import { describe, it, expect } from 'vitest'
import { monthlyTarget } from '@/components/aTaxTable/ATaxTable'

describe('宿泊税テーブルの対象月（今月・先月）', () => {
  it.each([
    ['2026-05-20', { targetYear: 2026, targetMonth: 5, currentLabel: '5月' }, { targetYear: 2026, targetMonth: 4, previousLabel: '4月' }],
    ['2026-01-01', { targetYear: 2026, targetMonth: 1, currentLabel: '1月' }, { targetYear: 2025, targetMonth: 12, previousLabel: '12月' }],
  ] as const)('今日（JST）が %s', (today, current, previous) => {
    expect(monthlyTarget('current', today)).toMatchObject(current)
    expect(monthlyTarget('previous', today)).toMatchObject(previous)
  })
})
