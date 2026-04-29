'use client'

import { useState, useSyncExternalStore } from 'react'
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
  // useSyncExternalStore: SSR時はgetServerSnapshot（空文字）、クライアントではgetSnapshot（今日の日付）を返す。
  // hydration mismatchとuseEffect+setStateのアンチパターンを両方避けられる。
  const clientToday = useSyncExternalStore(
    () => () => {},
    () => getTodayJST(),
    () => '',
  )

  // ユーザー操作による日付変更。null = clientToday（今日）を使用。
  const [override, setOverride] = useState<string | null>(null)
  const selectedDate = override ?? clientToday
  const today = getTodayJST()

  return {
    selectedDate,
    dateLabel: selectedDate ? formatDateLabel(selectedDate) : '',
    diffLabel: selectedDate ? formatDiffLabel(today, selectedDate) : '',
    setDate: (date: string) => { if (date) setOverride(date) },
    goToPrevDay: () => setOverride((d) => addDays(d ?? clientToday, -1)),
    goToNextDay: () => setOverride((d) => addDays(d ?? clientToday, 1)),
    goToToday: () => setOverride(null),
  }
}
