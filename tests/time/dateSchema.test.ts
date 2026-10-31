import { describe, it, expect, vi, afterEach } from 'vitest'
import { DateSchema } from '@/lib/api/dateSchema'
import { setNowJST, JST_BOUNDARY_TIMES } from '@tests/utils/timeHelper'

const ok = (v: string) => DateSchema.safeParse(v).success

describe('DateSchema（実在日）', () => {
  it.each(['2024-02-29', '2026-03-08', '2026-11-01', '2026-12-31'])('%s は実在する', (d) => {
    vi.useFakeTimers()
    setNowJST(`${d}T12:00`) // 範囲チェックに当たらないよう、今日をその日にする
    expect(ok(d)).toBe(true)
    vi.useRealTimers()
  })

  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10'])('%s は実在しない', (d) => {
    expect(ok(d)).toBe(false)
  })
})

// 範囲は今日（JST）から 100 日前〜365 日後。JST 0:00〜9:00 は UTC では前日なので、ここで境界がずれないか
describe.each(JST_BOUNDARY_TIMES)('DateSchema（範囲） JST 2026-05-20 %s', (time) => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['100 日前（端）', '2026-02-09', true],
    ['101 日前', '2026-02-08', false],
    ['365 日後（端）', '2027-05-20', true],
    ['366 日後', '2027-05-21', false],
  ] as const)('%s %s', (_label, date, expected) => {
    vi.useFakeTimers()
    setNowJST(`2026-05-20T${time}`)
    expect(ok(date)).toBe(expected)
  })
})
