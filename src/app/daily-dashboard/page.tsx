import { Suspense } from 'react'
import { DailyDashboard } from './DailyDashboard'

export default function DailyDashboardPage() {
  return (
    <Suspense>
      <DailyDashboard />
    </Suspense>
  )
}
