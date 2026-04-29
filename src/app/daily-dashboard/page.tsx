'use client'

import { useState, useCallback } from 'react'
import Backdrop from '@mui/material/Backdrop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
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

export default function DailyDashboardPage() {
  const { selectedDate, dateLabel, diffLabel, setDate, goToPrevDay, goToNextDay, goToToday } =
    useDateNavigation()

  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)

  const openPrintTab = useCallback((url: string) => {
    const child = window.open(url, '_blank')
    if (!child) return
    setIsPrinting(true)
    const timer = setInterval(() => {
      if (child.closed) {
        clearInterval(timer)
        setIsPrinting(false)
      }
    }, 500)
  }, [])

  const handlePrintTimetable = () => openPrintTab(`/timetable?date=${selectedDate}&autoprint=1`)
  const handlePrintCleaningBoard = () => openPrintTab(`/cleaning-board?date=${selectedDate}&autoprint=1`)

  return (
    <Box sx={{ p: 3 }}>
      <Backdrop open={isPrinting} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, flexDirection: 'column', gap: 2 }}>
        <CircularProgress color="inherit" />
        <Typography color="inherit">印刷ダイアログが開いています。完了後に操作できます。</Typography>
      </Backdrop>

      {/* 日付ナビゲーション */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 4 }}>
        <IconButton onClick={goToPrevDay} size="small" aria-label="前日">
          <NavigateBeforeIcon />
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

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mx: 0.5 }}>
          <Typography fontWeight="bold">{dateLabel}</Typography>
          <Typography variant="body2" color="text.secondary">
            ({diffLabel})
          </Typography>
        </Box>

        <IconButton onClick={goToNextDay} size="small" aria-label="翌日">
          <NavigateNextIcon />
        </IconButton>

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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 320 }}>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrintTimetable}
          data-testid="print-timetable"
        >
          タイムテーブル印刷（{dateLabel}）
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrintCleaningBoard}
          data-testid="print-cleaning-board"
        >
          清掃ボード印刷（{dateLabel}）
        </Button>
      </Box>
    </Box>
  )
}
