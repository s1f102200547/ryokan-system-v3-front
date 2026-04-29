'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PrintIcon from '@mui/icons-material/Print'
import { useDateNavigation } from '@/hooks/date/useDateNavigation'

export default function DailyDashboardPage() {
  const { selectedDate, dateLabel, diffLabel, goToPrevDay, goToNextDay, goToToday } =
    useDateNavigation()

  const handlePrintTimetable = () => {
    window.open(`/timetable?date=${selectedDate}`, '_blank')
  }

  const handlePrintCleaningBoard = () => {
    window.open(`/cleaning-board?date=${selectedDate}`, '_blank')
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* 日付ナビゲーション */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 4 }}>
        <IconButton onClick={goToPrevDay} size="small" aria-label="前日">
          <NavigateBeforeIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mx: 0.5 }}>
          <CalendarMonthIcon fontSize="small" color="action" />
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
