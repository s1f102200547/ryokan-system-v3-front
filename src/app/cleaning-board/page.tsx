'use client'

import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import { useCleaningBoard } from '@/hooks/cleaningBoard/useCleaningBoard'
import { CleaningBoardTable } from '@/components/cleaningBoard/CleaningBoardTable'
import { CleaningBoardFooter } from '@/components/cleaningBoard/CleaningBoardFooter'
import { CleaningBoardNotes } from '@/components/cleaningBoard/CleaningBoardNotes'
import { Loading } from '@/components/Loading'

const TODAY = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const wk = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${month}月${day}日（${wk}）`
}

export default function CleaningBoardPage() {
  const { data, isLoading, error } = useCleaningBoard(TODAY)

  if (isLoading) return <Loading />

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  if (!data) return null

  return (
    <Box sx={{ p: 2 }}>
      {data.unassignedReservations.length > 0 && (
        <Alert severity="warning" data-testid="unassigned-warning" sx={{ mb: 2 }}>
          部屋が割り当てられていない予約があります（{data.unassignedReservations.length}件）
        </Alert>
      )}

      <Box className="no-print" sx={{ mb: 1 }}>
        <button onClick={() => window.print()}>印刷</button>
      </Box>

      <Box className="print-area" sx={{ fontFamily: 'sans-serif', fontSize: '8pt', color: '#000' }}>
        <div style={{ fontSize: '1.2em', marginBottom: 6 }}>{formatDateHeader(TODAY)}</div>
        <CleaningBoardTable rows={data.rows} />
        <CleaningBoardFooter />
        <CleaningBoardNotes rows={data.rows} />
      </Box>
    </Box>
  )
}
