import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { useDateNavigation } from '@/hooks/date/useDateNavigation'

// 日付ナビ（Domain.md「画面」）: 今日 −100 日〜 +365 日。?date= で日付を持つ。
// 範囲外・形式違いの ?date= は今日を出し、範囲外なら警告する。ほかのクエリ（開発用の ?today= など）は引き継ぐ

let searchParams = new URLSearchParams()
const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/daily-dashboard',
  useSearchParams: () => searchParams,
}))

const TODAY = '2026-04-12'

// 移動先の URL。router.push でも history.pushState でも同じように取れるようにする（実装の方法に依存しない）
let pushState: MockInstance<History['pushState']>
function navigations(): string[] {
  const viaRouter = push.mock.calls.map((c) => String(c[0]))
  const viaHistory = pushState.mock.calls.map((c) => String(c[2]))
  return [...viaRouter, ...viaHistory].map((u) => {
    const url = new URL(u, 'http://localhost/daily-dashboard')
    return `${url.pathname}${url.search}`
  })
}

function setup(query: string) {
  searchParams = new URLSearchParams(query)
  return renderHook(() => useDateNavigation(TODAY))
}

describe('useDateNavigation', () => {
  beforeEach(() => {
    push.mockReset()
    pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
  })
  afterEach(() => {
    pushState.mockRestore()
  })

  it('?date= がなければ今日', () => {
    const { result } = setup('')
    expect(result.current.selectedDate).toBe(TODAY)
    expect(result.current.diffLabel).toBe('今日')
    expect(result.current.outOfRangeWarning).toBeNull()
  })

  it('?date= の日を出す', () => {
    const { result } = setup('date=2026-04-13')
    expect(result.current.selectedDate).toBe('2026-04-13')
    expect(result.current.dateLabel).toBe('4/13')
    expect(result.current.diffLabel).toBe('明日')
  })

  it('形式の違う ?date= は今日を出す（警告しない）', () => {
    const { result } = setup('date=2026-4-13')
    expect(result.current.selectedDate).toBe(TODAY)
    expect(result.current.outOfRangeWarning).toBeNull()
  })

  it.each(['2026-02-30', '2026-13-01', '2026-04-00'])('実在しない日付 %s は今日を出す', (date) => {
    const { result } = setup(`date=${date}`)
    expect(result.current.selectedDate).toBe(TODAY)
  })

  it.each([
    ['2026-01-02', '100日前（範囲の端）', true],
    ['2026-01-01', '101日前', false],
    ['2027-04-12', '365日後（範囲の端）', true],
    ['2027-04-13', '366日後', false],
  ])('%s（%s）', (date, _label, inRange) => {
    const { result } = setup(`date=${date}`)
    expect(result.current.selectedDate).toBe(inRange ? date : TODAY)
    expect(result.current.outOfRangeWarning === null).toBe(inRange)
  })

  it('翌日・前日へ移るときは ?date= を書き換え、ほかのクエリを残す', () => {
    const { result } = setup('date=2026-04-12&today=2026-04-12')
    act(() => result.current.goToNextDay())
    act(() => result.current.goToPrevDay())
    expect(navigations()).toEqual([
      '/daily-dashboard?date=2026-04-13&today=2026-04-12',
      '/daily-dashboard?date=2026-04-11&today=2026-04-12',
    ])
  })

  it('月・年をまたいでも正しい日に移る', () => {
    const { result } = setup('date=2026-12-31')
    act(() => result.current.goToNextDay())
    expect(navigations()).toEqual(['/daily-dashboard?date=2027-01-01'])
  })

  it('範囲の端では、その先へ進めない', () => {
    const { result } = setup('date=2027-04-12')
    expect(result.current.isNextDisabled).toBe(true)
    act(() => result.current.goToNextDay())
    expect(navigations()).toEqual(['/daily-dashboard?date=2027-04-12'])
  })

  it('setDate は範囲の中に収める', () => {
    const { result } = setup('')
    act(() => result.current.setDate('2030-01-01'))
    expect(navigations()).toEqual(['/daily-dashboard?date=2027-04-12'])
  })

  it('Today は ?date= を消し、ほかのクエリを残す', () => {
    const { result } = setup('date=2026-04-20&today=2026-04-12')
    act(() => result.current.goToToday())
    expect(navigations()).toEqual(['/daily-dashboard?today=2026-04-12'])
  })
})
