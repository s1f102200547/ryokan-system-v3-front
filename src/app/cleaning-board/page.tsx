'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import { useCleaningBoard } from '@/hooks/cleaningBoard/useCleaningBoard'
import { CleaningBoardTable } from '@/components/cleaningBoard/CleaningBoardTable'
import { CleaningBoardFooter } from '@/components/cleaningBoard/CleaningBoardFooter'
import { CleaningBoardNotes } from '@/components/cleaningBoard/CleaningBoardNotes'
import { Loading } from '@/components/Loading'

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const wk = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${month}月${day}日（${wk}）`
}

function CleaningBoardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date')
  const autoprint = searchParams.get('autoprint') === '1'

  useEffect(() => {
    if (!dateParam) router.replace('/daily-dashboard')
  }, [dateParam, router])

  const targetDate = dateParam ?? ''
  const { data, isLoading, error } = useCleaningBoard(targetDate)
  const autoPrintTriggered = useRef(false)

  useEffect(() => {
    if (autoprint && data && !isLoading && !autoPrintTriggered.current) {
      autoPrintTriggered.current = true
      const handleAfterPrint = () => window.close()
      window.addEventListener('afterprint', handleAfterPrint)
      window.print()
    }
  }, [autoprint, data, isLoading])

  if (!dateParam) return null
  if (isLoading) return <Loading />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!data) return null

  return (
    <Box sx={{ px: 2, pt: 0.5, pb: 2 }}>
      {data.unassignedReservations.length > 0 && (
        <Alert severity="warning" data-testid="unassigned-warning" sx={{ mb: 2 }}>
          部屋が割り当てられていない予約があります（{data.unassignedReservations.length}件）
        </Alert>
      )}

      <Box className="print-area" sx={{ fontFamily: 'sans-serif', fontSize: '8pt', color: '#000' }}>
        <div style={{ fontSize: '1.2em', marginBottom: 6 }}>{formatDateHeader(targetDate)}</div>
        <CleaningBoardTable rows={data.rows} />
        <CleaningBoardFooter />
        <CleaningBoardNotes rows={data.rows} />
      </Box>
    </Box>
  )
}

export default function CleaningBoardPageWrapper() {
  return (
    <Suspense fallback={<Loading />}>
      <CleaningBoardPage />
    </Suspense>
  )
}
