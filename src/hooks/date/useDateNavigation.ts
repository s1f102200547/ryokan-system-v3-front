'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DATE_REGEX, addDays, formatDateLabel, formatDiffLabel } from '@/lib/dateUtils'
import { DATE_RANGE_PAST_DAYS, DATE_RANGE_FUTURE_DAYS } from '@/constants/date'
import type { UseDateNavigationReturn } from '@/types/date'

// today: Server Component で getTodayJST() を呼び出し、props 経由で渡す。
// SSR と CSR で同じ値を使うことで hydration mismatch を防ぐ。
export function useDateNavigation(today: string): UseDateNavigationReturn {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const rawDate = searchParams.get('date')
  const selectedDate = rawDate !== null && DATE_REGEX.test(rawDate) ? rawDate : today

  const minDate = addDays(today, -DATE_RANGE_PAST_DAYS)
  const maxDate = addDays(today, DATE_RANGE_FUTURE_DAYS)

  const clamp = (date: string) =>
    date < minDate ? minDate : date > maxDate ? maxDate : date

  const navigate = (date: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('date', date)
    router.push(`${pathname}?${params.toString()}`)
  }

  const goToToday = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('date')
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return {
    selectedDate,
    dateLabel: formatDateLabel(selectedDate),
    diffLabel: formatDiffLabel(today, selectedDate),
    setDate: (date: string) => { if (date) navigate(clamp(date)) },
    goToPrevDay: () => navigate(clamp(addDays(selectedDate, -1))),
    goToNextDay: () => navigate(clamp(addDays(selectedDate, 1))),
    goToToday,
    isPrevDisabled: selectedDate <= minDate,
    isNextDisabled: selectedDate >= maxDate,
    minDate,
    maxDate,
  }
}
