'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PrintIcon from '@mui/icons-material/Print'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs from 'dayjs'
import { useDateNavigation } from '@/hooks/date/useDateNavigation'
import { TimetablePrintContent } from './TimetablePrintContent'
import { CleaningBoardPrintContent } from './CleaningBoardPrintContent'

type PrintMode = 'timetable' | 'cleaning-board' | null

type Props = {
  initialDate: string
}

export function DailyDashboard({ initialDate }: Props) {
  const { selectedDate, dateLabel, diffLabel, setDate, goToPrevDay, goToNextDay, goToToday } =
    useDateNavigation(initialDate)

  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null)
  const [printMode, setPrintMode] = useState<PrintMode>(null)

  return (
    <Box sx={{ p: 3 }}>
      {/* 日付ナビゲーション */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 4, '@media print': { display: 'none' } }}>
        <IconButton onClick={goToPrevDay} size="small" aria-label="前日" data-testid="prev-day">
          <NavigateBeforeIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mx: 0.5 }}>
          <Typography fontWeight="bold" data-testid="date-label">{dateLabel}</Typography>
          <Typography variant="body2" color="text.secondary" data-testid="diff-label">
            ({diffLabel})
          </Typography>
        </Box>

        <IconButton onClick={goToNextDay} size="small" aria-label="翌日" data-testid="next-day">
          <NavigateNextIcon />
        </IconButton>

        <IconButton
          size="small"
          aria-label="日付を選択"
          onClick={(e) => setCalendarAnchor(e.currentTarget)}
        >
          <CalendarMonthIcon fontSize="small" />
        </IconButton>

        <Popover
          open={Boolean(calendarAnchor)}
          anchorEl={calendarAnchor}
          onClose={() => setCalendarAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <DateCalendar
            value={dayjs(selectedDate)}
            onChange={(newValue) => {
              if (newValue) {
                setDate(newValue.format('YYYY-MM-DD'))
                setCalendarAnchor(null)
              }
            }}
          />
        </Popover>

        <Button
          variant="outlined"
          size="small"
          onClick={goToToday}
          sx={{ borderRadius: '20px', ml: 1, textTransform: 'none' }}
        >
          Today
        </Button>
      </Box>

      {/* 印刷ボタン */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 320, '@media print': { display: 'none' } }}>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={() => setPrintMode('timetable')}
          data-testid="print-timetable"
        >
          タイムテーブル印刷（{dateLabel}）
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={() => setPrintMode('cleaning-board')}
          data-testid="print-cleaning-board"
        >
          清掃ボード印刷（{dateLabel}）
        </Button>
      </Box>

      {/* 印刷コンテンツ（各コンポーネントが自身の Backdrop と印刷レイアウトを管理する） */}
      {printMode === 'timetable' && (
        <TimetablePrintContent
          date={selectedDate}
          onPrintReady={() => window.print()}
          onAfterPrint={() => setPrintMode(null)}
        />
      )}
      {printMode === 'cleaning-board' && (
        <CleaningBoardPrintContent
          date={selectedDate}
          onPrintReady={() => window.print()}
          onAfterPrint={() => setPrintMode(null)}
        />
      )}
    </Box>
  )
}
