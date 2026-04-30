import { getTodayJST } from '@/lib/dateUtils'
import { DailyDashboard } from './DailyDashboard'

export default function DailyDashboardPage() {
  const today = getTodayJST()
  return <DailyDashboard initialDate={today} />
}
