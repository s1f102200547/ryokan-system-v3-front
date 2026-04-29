'use client'

import { useState } from 'react'
import { getTodayJST, addDays, dateDiff, formatDateLabel } from '@/lib/dateUtils'
import type { UseDateNavigationReturn } from '@/types/date'

function formatDiffLabel(today: string, selected: string): string {
  const diff = dateDiff(today, selected)
  if (diff === 0) return '今日'
  if (diff === 1) return '明日'
  if (diff === -1) return '昨日'
  if (diff > 0) return `${diff}日後`
  return `${Math.abs(diff)}日前`
}

export function useDateNavigation(): UseDateNavigationReturn {
  const today = getTodayJST()
  const [selectedDate, setSelectedDate] = useState(today)

  return {
    selectedDate,
    dateLabel: formatDateLabel(selectedDate),
    diffLabel: formatDiffLabel(today, selectedDate),
    goToPrevDay: () => setSelectedDate((d) => addDays(d, -1)),
    goToNextDay: () => setSelectedDate((d) => addDays(d, 1)),
    goToToday: () => setSelectedDate(getTodayJST()),
  }
}
