'use client'

import { useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Backdrop from '@mui/material/Backdrop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useCleaningBoard } from '@/hooks/cleaningBoard/useCleaningBoard'
import { CleaningBoardTable } from '@/components/cleaningBoard/CleaningBoardTable'
import { CleaningBoardFooter } from '@/components/cleaningBoard/CleaningBoardFooter'
import { CleaningBoardNotes } from '@/components/cleaningBoard/CleaningBoardNotes'

type Props = {
  date: string
  onPrintReady: () => void
  onAfterPrint: () => void
}

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const wk = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${month}月${day}日（${wk}）`
}

export function CleaningBoardPrintContent({ date, onPrintReady, onAfterPrint }: Props) {
  const { data, isLoading, error } = useCleaningBoard(date)

  useEffect(() => {
    if (!isLoading && data) {
      onPrintReady()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, data])

  useEffect(() => {
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {/* ロード中・エラー時の Backdrop（スクリーンのみ） */}
      <Backdrop
        open={isLoading || !!error}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          flexDirection: 'column',
          gap: 2,
          '@media print': { display: 'none' },
        }}
      >
        {isLoading && (
          <>
            <CircularProgress color="inherit" />
            <Typography color="inherit">印刷データを読み込んでいます...</Typography>
          </>
        )}
        {error && (
          <>
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={onAfterPrint}>
                  閉じる
                </Button>
              }
            >
              {error}
            </Alert>
          </>
        )}
      </Backdrop>

      {/* 未割り当て予約の警告（スクリーンのみ表示） */}
      {data && data.unassignedReservations.length > 0 && (
        <Box
          sx={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: (theme) => theme.zIndex.drawer + 2,
            '@media print': { display: 'none' },
          }}
        >
          <Alert severity="warning" data-testid="unassigned-warning">
            部屋が割り当てられていない予約があります（{data.unassignedReservations.length}件）
          </Alert>
        </Box>
      )}

      {/* 印刷コンテンツ（スクリーンでは非表示、印刷時のみ表示） */}
      <Box
        sx={{
          '@media screen': { display: 'none' },
          '@media print': { display: 'block' },
          px: 2,
          pt: 0.5,
          pb: 2,
        }}
      >
        {data && (
          <Box className="print-area" sx={{ fontFamily: 'sans-serif', fontSize: '8pt', color: '#000' }}>
            <div
              data-testid="cleaning-board-date"
              style={{ fontSize: '1.2em', marginBottom: 6 }}
            >
              {formatDateHeader(date)}
            </div>
            <CleaningBoardTable rows={data.rows} />
            <CleaningBoardFooter />
            <CleaningBoardNotes rows={data.rows} />
          </Box>
        )}
      </Box>
    </>
  )
}
