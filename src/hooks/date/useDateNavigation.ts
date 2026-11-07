'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { isRealDate, addDays, formatDateLabel, formatDiffLabel } from '@/lib/dateUtils'
import { DATE_RANGE_PAST_DAYS, DATE_RANGE_FUTURE_DAYS } from '@/constants/date'
import type { UseDateNavigationReturn } from '@/types/date'

// today: Server Component で getTodayJST() を呼び出し、props 経由で渡す。
// SSR と CSR で同じ値を使うことで hydration mismatch を防ぐ。
export function useDateNavigation(today: string): UseDateNavigationReturn {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const minDate = addDays(today, -DATE_RANGE_PAST_DAYS)
  const maxDate = addDays(today, DATE_RANGE_FUTURE_DAYS)

  const clamp = (date: string) =>
    date < minDate ? minDate : date > maxDate ? maxDate : date

  // ?date= から表示する日を決める。形の違う日付・実在しない日付（2026-02-30 など）と範囲外は今日を出す
  // （API も 400 にする日付なので、そのまま使うと画面がエラーになる）
  const resolve = (params: URLSearchParams) => {
    const rawDate = params.get('date')
    const isValid = rawDate !== null && isRealDate(rawDate)
    const isOutOfRange = isValid && (rawDate < minDate || rawDate > maxDate)
    return { selectedDate: isValid && !isOutOfRange ? rawDate : today, isOutOfRange }
  }
  const { selectedDate, isOutOfRange } = resolve(searchParams)
  const outOfRangeWarning: string | null = isOutOfRange
    ? '指定された日付は表示可能な範囲外です。今日の日付を表示しています。'
    : null

  // 日付の切り替えはブラウザの履歴だけを書き換える（Next.js の Native History API。useSearchParams と同期し、戻る・進むも効く）。
  // router.push だと、サーバーでページを描き直す往復を待ってから ?date= が変わり、その後にカードを取りに行っていた。
  // サーバーで描くものは日付によらない（today は最初の表示の値。Session Cookie が 23:00 に切れるので日をまたがない）。
  // 境界は各 API の requireSession なので、proxy.ts を通らなくても守りは変わらない
  const pushUrl = (params: URLSearchParams) => {
    const query = params.toString()
    window.history.pushState(null, '', query ? `${pathname}?${query}` : pathname)
  }

  // 押した時点の URL から計算する。描き直しの前に続けて押すと、レンダー時の searchParams はまだ前の日で、
  // 「翌日」を2回押しても1日しか進まなかった
  const currentParams = () => new URLSearchParams(window.location.search)

  const navigate = (toDate: (current: string) => string) => {
    const params = currentParams()
    params.set('date', clamp(toDate(resolve(params).selectedDate)))
    pushUrl(params)
  }

  const goToToday = () => {
    const params = currentParams()
    params.delete('date')
    pushUrl(params)
  }

  return {
    selectedDate,
    dateLabel: formatDateLabel(selectedDate),
    diffLabel: formatDiffLabel(today, selectedDate),
    setDate: (date: string) => { if (date) navigate(() => date) },
    goToPrevDay: () => navigate((current) => addDays(current, -1)),
    goToNextDay: () => navigate((current) => addDays(current, 1)),
    goToToday,
    isPrevDisabled: selectedDate <= minDate,
    isNextDisabled: selectedDate >= maxDate,
    minDate,
    maxDate,
    outOfRangeWarning,
  }
}
