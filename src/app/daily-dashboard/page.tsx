import { Suspense } from 'react'
import { getTodayJST } from '@/lib/dateUtils'
import { DailyDashboard } from './DailyDashboard'

type Props = {
  searchParams: Promise<{ date?: string; today?: string }>
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

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
