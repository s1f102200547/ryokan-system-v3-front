import { Suspense } from 'react'
import { getTodayJST, DATE_REGEX } from '@/lib/dateUtils'
import { DailyDashboard } from './DailyDashboard'

type Props = {
  searchParams: Promise<{ date?: string; today?: string }>
}

export default async function DailyDashboardPage({ searchParams }: Props) {
  const { today: todayParam } = await searchParams
  const todayOverride = process.env.NODE_ENV !== 'production' ? todayParam : undefined
  const today = todayOverride !== undefined && DATE_REGEX.test(todayOverride) ? todayOverride : getTodayJST()
  return (
    <Suspense>
      <DailyDashboard today={today} />
    </Suspense>
  )
}
