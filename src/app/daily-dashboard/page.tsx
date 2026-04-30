import { getTodayJST } from '@/lib/dateUtils'
import { DailyDashboard } from './DailyDashboard'

type Props = {
  searchParams: Promise<{ date?: string }>
}

export default async function DailyDashboardPage({ searchParams }: Props) {
  const { date } = await searchParams
  const isValidDate = date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const today = isValidDate ? date : getTodayJST()
  return <DailyDashboard initialDate={today} />
}
