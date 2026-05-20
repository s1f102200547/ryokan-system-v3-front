'use client'

import { useState, useCallback } from 'react'
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
import { useDateNavigation } from '@/hooks/date/useDateNavigation'
import { addDays } from '@/lib/dateUtils'
import { DashboardTabs } from '@/components/DashboardTabs'
import { GuestInfoSection } from '@/components/guestInfo/GuestInfoSection'
import { DailyTodoEditor } from '@/components/daily/DailyTodoEditor'
import { useDailyTodos } from '@/hooks/daily/useDailyTodos'
import type { GuestInfoToggle } from '@/types/guestInfo'
import { TimetablePrintContent } from './TimetablePrintContent'
import { CleaningBoardPrintContent } from './CleaningBoardPrintContent'

type PrintMode = 'timetable' | 'cleaning-board' | null

type Props = {
  today: string
}

export function DailyDashboard({ today }: Props) {
  const { selectedDate, dateLabel, diffLabel, setDate, goToPrevDay, goToNextDay, goToToday,
          isPrevDisabled, isNextDisabled, minDate, maxDate } =
    useDateNavigation(today)

  const [calendarAnchor, setCalendarAnchor] = useState<HTMLElement | null>(null)
  const [printMode, setPrintMode] = useState<PrintMode>(null)
  const [selectedToggle, setSelectedToggle] = useState<GuestInfoToggle | null>(null)
  const { todos, isLoading: todosLoading, error: todosError, isSaving, saveError, addTodo, removeTodo } = useDailyTodos(selectedDate)
  const tomorrow = addDays(today, 1)
  const canPrintCleaningBoard = selectedDate === today || selectedDate === tomorrow
  const cleaningBoardPrintDate = selectedDate === today ? tomorrow : selectedDate
  const cleaningBoardButtonLabel =
    selectedDate === today ? '明日の掃除ボード' : 'この日の掃除ボード'

  // useEffect の deps に渡すため useCallback で安定化する。
  // インラインラムダのままだとレンダーごとに参照が変わり、afterprint リスナーが毎回付け直される。
  const handleTimetablePrintReady = useCallback(() => window.print(), [])
  const handleAfterPrint = useCallback(() => setPrintMode(null), [])

  const printButtonSx = {
    textTransform: 'none',
    fontSize: '0.72rem',
    minHeight: 26,
    px: 1,
    py: 0.25,
    color: 'text.secondary',
    borderColor: 'divider',
    '& .MuiButton-startIcon': {
      mr: 0.35,
    },
    '&:hover': {
      borderColor: 'text.secondary',
      bgcolor: 'action.hover',
    },
    '&:active': {
      color: 'primary.main',
      borderColor: 'primary.main',
      bgcolor: 'primary.50',
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
          mt: 2,
        
          borderBottom: '1px solid',
          borderColor: 'divider',
          '@media print': { display: 'none' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton onClick={goToPrevDay} aria-label="前日" data-testid="prev-day" disabled={isPrevDisabled}>
            <NavigateBeforeIcon fontSize="medium" />
          </IconButton>

          <Box
            key={selectedDate}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mx: 0.75,
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              animation: 'dateLabelChange 220ms ease-out',
              '@media (prefers-reduced-motion: reduce)': {
                animation: 'none',
              },
              '@keyframes dateLabelChange': {
                '0%': {
                  opacity: 0.35,
                  transform: 'translateY(-4px)',
                  bgcolor: 'action.selected',
                },
                '100%': {
                  opacity: 1,
                  transform: 'translateY(0)',
                  bgcolor: 'transparent',
                },
              },
            }}
          >
            <Typography fontSize="1.15rem" data-testid="date-label">{dateLabel.replace('/', ' / ')}</Typography>
            <Typography variant="body1" color="text.secondary" data-testid="diff-label">
              ( {diffLabel} )
            </Typography>
          </Box>

          <IconButton onClick={goToNextDay} aria-label="翌日" data-testid="next-day" disabled={isNextDisabled}>
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
            sx={{
              borderRadius: '20px',
              ml: 1,
              textTransform: 'none',
              fontSize: '0.9rem',
              color: 'text.secondary',
              borderColor: 'divider',
              borderWidth: '1.5px',
              '&:hover': {
                borderColor: 'text.secondary',
                bgcolor: 'action.hover',
              },
            }}
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
            minDate={dayjs(minDate)}
            maxDate={dayjs(maxDate)}
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
                  startIcon={<PrintIcon fontSize="small" />}
                  sx={printButtonSx}
                >
                  この日の掃除ボード
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
            この日のタイムテーブル
          </Button>
        </Box>
        <Box sx={{ width: 'min(300px, 46vw)', opacity: 0.88, pt: 0.5 }}>
          <DailyTodoEditor
            todos={todos}
            isLoading={todosLoading}
            error={todosError}
            isSaving={isSaving}
            saveError={saveError}
            onAdd={addTodo}
            onRemove={removeTodo}
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
                color="primary"
                sx={{
                  '& .MuiToggleButton-root.Mui-selected': {
                    color: 'primary.main',
                    borderColor: 'primary.main',
                    bgcolor: 'primary.50',
                  },
                  '& .MuiToggleButton-root.Mui-selected:hover': {
                    bgcolor: 'primary.100',
                  },
                }}
              >
                <ToggleButton value="checkIn">到着</ToggleButton>
                <ToggleButton value="openAirBath">露天</ToggleButton>
                <ToggleButton value="dinner">夕食</ToggleButton>
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
          onPrintReady={handleTimetablePrintReady}
          onAfterPrint={handleAfterPrint}
        />
      )}
      {printMode === 'cleaning-board' && (
        <CleaningBoardPrintContent
          date={cleaningBoardPrintDate}
          onPrintReady={handleTimetablePrintReady}
          onAfterPrint={handleAfterPrint}
        />
      )}
    </Box>
  )
}
