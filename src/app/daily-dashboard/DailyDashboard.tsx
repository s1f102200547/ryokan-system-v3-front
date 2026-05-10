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
import { addDays, formatDateLabel } from '@/lib/dateUtils'
import { DashboardTabs } from '@/components/DashboardTabs'
import { GuestInfoSection } from '@/components/guestInfo/GuestInfoSection'
import { TimetablePrintContent } from './TimetablePrintContent'
import { CleaningBoardPrintContent } from './CleaningBoardPrintContent'

type PrintMode = 'timetable' | 'cleaning-board' | null

type Props = {
  today: string
}

export function DailyDashboard({ today }: Props) {
  const { selectedDate, dateLabel, diffLabel, setDate, goToPrevDay, goToNextDay, goToToday } =
    useDateNavigation(today)

  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null)
  const [printMode, setPrintMode] = useState<PrintMode>(null)

  return (
    <Box sx={{ p: 3 }}>
      <DashboardTabs />

      {/* 日付ナビゲーション */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          mb: 4,
          '@media print': { display: 'none' },
        }}
      >
        <IconButton onClick={goToPrevDay} aria-label="前日" data-testid="prev-day">
          <NavigateBeforeIcon fontSize="medium" />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mx: 0.75 }}>
          <Typography fontSize="1.15rem" data-testid="date-label">{dateLabel.replace('/', ' / ')}</Typography>
          <Typography variant="body1" color="text.secondary" data-testid="diff-label">
            ( {diffLabel} )
          </Typography>
        </Box>

        <IconButton onClick={goToNextDay} aria-label="翌日" data-testid="next-day">
          <NavigateNextIcon fontSize="medium" />
        </IconButton>

        <IconButton
          aria-label="日付を選択"
          onClick={(e) => setCalendarAnchor(e.currentTarget)}
        >
          <CalendarMonthIcon fontSize="medium" />
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
          sx={{ borderRadius: '20px', ml: 1, textTransform: 'none', fontSize: '0.9rem' }}
        >
          Today
        </Button>

        {/* 印刷ボタン（右端） */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon fontSize="small" />}
            onClick={() => setPrintMode('timetable')}
            data-testid="print-timetable"
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            {formatDateLabel(selectedDate)} タイムテーブル
          </Button>
          {selectedDate === today && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrintIcon fontSize="small" />}
              onClick={() => setPrintMode('cleaning-board')}
              data-testid="print-cleaning-board"
              sx={{ textTransform: 'none', fontSize: '0.8rem' }}
            >
              翌日 清掃ボード
            </Button>
          )}
        </Box>
      </Box>

      {/* GuestInfo セクション */}
      <Box sx={{ '@media print': { display: 'none' } }}>
        <GuestInfoSection selectedDate={selectedDate} />
      </Box>

      {/* 印刷コンテンツ */}
      {printMode === 'timetable' && (
        <TimetablePrintContent
          date={selectedDate}
          onPrintReady={() => window.print()}
          onAfterPrint={() => setPrintMode(null)}
        />
      )}
      {printMode === 'cleaning-board' && (
        <CleaningBoardPrintContent
          date={addDays(selectedDate, 1)}
          onPrintReady={() => window.print()}
          onAfterPrint={() => setPrintMode(null)}
        />
      )}
    </Box>
  )
}
