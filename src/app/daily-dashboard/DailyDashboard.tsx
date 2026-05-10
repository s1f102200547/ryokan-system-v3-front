'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PrintIcon from '@mui/icons-material/Print'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs from 'dayjs'
import TextField from '@mui/material/TextField'
import { useDateNavigation } from '@/hooks/date/useDateNavigation'
import { addDays } from '@/lib/dateUtils'
import { DashboardTabs } from '@/components/DashboardTabs'
import { GuestInfoSection } from '@/components/guestInfo/GuestInfoSection'
import { useDailyMemo } from '@/hooks/daily/useDailyMemo'
import type { GuestInfoToggle } from '@/types/guestInfo'
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
  const [selectedToggle, setSelectedToggle] = useState<GuestInfoToggle | null>(null)
  const { memo, isSaving, updateMemo } = useDailyMemo(selectedDate)
  const tomorrow = addDays(today, 1)
  const canPrintCleaningBoard = selectedDate === today || selectedDate === tomorrow
  const cleaningBoardPrintDate = selectedDate === today ? tomorrow : selectedDate
  const cleaningBoardButtonLabel =
    selectedDate === today ? '明日の掃除ボード印刷' : 'この日の掃除ボード印刷'
  const printButtonSx = {
    textTransform: 'none',
    fontSize: '0.8rem',
    color: 'text.secondary',
    borderColor: 'divider',
    '&:hover': {
      borderColor: 'text.secondary',
      bgcolor: 'action.hover',
    },
  }

  return (
    <Box sx={{ width: '90%', mx: 'auto', p: 3 }}>
      <DashboardTabs />

      {/* 日付ナビゲーション */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          mt: -4,
          pb: 1,
          mb: 0.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '@media print': { display: 'none' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, transform: 'translateY(-6px)' }}>
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

          <Button
            variant="outlined"
            size="small"
            onClick={goToToday}
            sx={{ borderRadius: '20px', ml: 1, textTransform: 'none', fontSize: '0.9rem' }}
          >
            Today
          </Button>
        </Box>

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
      </Box>

      {/* 印刷ボタン */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
          mb: 4,
          '@media print': { display: 'none' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {canPrintCleaningBoard ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PrintIcon fontSize="small" />}
              onClick={() => setPrintMode('cleaning-board')}
              data-testid="print-cleaning-board"
              sx={printButtonSx}
            >
              {cleaningBoardButtonLabel}
            </Button>
          ) : (
            <Tooltip title="掃除ボード印刷は今日・明日のみ対応しています">
              <span
                data-testid="print-cleaning-board-unavailable"
                style={{ display: 'inline-flex' }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  disabled
                  sx={printButtonSx}
                >
                  掃除ボード印刷
                </Button>
              </span>
            </Tooltip>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon fontSize="small" />}
            onClick={() => setPrintMode('timetable')}
            data-testid="print-timetable"
            sx={printButtonSx}
          >
            この日のタイムテーブル印刷
          </Button>
        </Box>
        <Box sx={{ width: 'min(260px, 42vw)', opacity: 0.88 }}>
          <TextField
            label="当日メモ"
            placeholder="当日メモ"
            multiline
            minRows={3}
            maxRows={3}
            fullWidth
            size="small"
            value={memo}
            onChange={(e) => updateMemo(e.target.value)}
            helperText={isSaving ? '保存中...' : ' '}
            slotProps={{ formHelperText: { sx: { minHeight: '14px', mt: 0.25, fontSize: '10px' } } }}
            sx={{
              '& .MuiInputBase-root': {
                alignItems: 'flex-start',
                fontSize: '11px',
                lineHeight: 1.25,
                py: 0.25,
              },
              '& .MuiInputBase-input': {
                fontSize: '11px',
                lineHeight: 1.25,
              },
              '& .MuiInputLabel-root': {
                fontSize: '11px',
              },
            }}
          />
        </Box>
      </Box>

      {/* GuestInfo セクション */}
      <Box sx={{ '@media print': { display: 'none' } }}>
        <GuestInfoSection
          selectedDate={selectedDate}
          selectedToggle={selectedToggle}
          topContent={
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: -3, mb: 1 }}>
              <ToggleButtonGroup
                value={selectedToggle}
                exclusive
                onChange={(_, value: GuestInfoToggle | null) => setSelectedToggle(value)}
                size="small"
              >
                <ToggleButton value="openAirBath">露天</ToggleButton>
                <ToggleButton value="dinner">夕食</ToggleButton>
                <ToggleButton value="checkIn">CI時間</ToggleButton>
                <ToggleButton value="breakfast">朝食</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          }
        />
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
          date={cleaningBoardPrintDate}
          onPrintReady={() => window.print()}
          onAfterPrint={() => setPrintMode(null)}
        />
      )}
    </Box>
  )
}
