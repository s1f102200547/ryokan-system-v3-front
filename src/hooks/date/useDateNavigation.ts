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

// initialDate: Server Component から渡されたサーバー確定の今日の日付 (YYYY-MM-DD)
// Server Component が getTodayJST() を呼ぶため SSR/クライアント間で値が一致し、
// useSyncExternalStore は不要になる。
export function useDateNavigation(initialDate: string): UseDateNavigationReturn {
  const [override, setOverride] = useState<string | null>(null)
  const selectedDate = override ?? initialDate
  const today = getTodayJST()
  return {
    selectedDate,
    dateLabel: formatDateLabel(selectedDate),
    diffLabel: formatDiffLabel(today, selectedDate),
    setDate: (date: string) => { if (date) setOverride(date) },
    goToPrevDay: () => setOverride((d) => addDays(d ?? initialDate, -1)),
    goToNextDay: () => setOverride((d) => addDays(d ?? initialDate, 1)),
    goToToday: () => setOverride(null),
  }
}
