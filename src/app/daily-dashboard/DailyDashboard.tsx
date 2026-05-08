'use client'

import { useState } from 'react'
import NextLink from 'next/link'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PrintIcon from '@mui/icons-material/Print'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import dayjs from 'dayjs'
import { useDateNavigation } from '@/hooks/date/useDateNavigation'
import { useSafeBalanceChecker } from '@/hooks/daily/useSafeBalanceChecker'
import { GuestInfoSection } from '@/components/guestInfo/GuestInfoSection'
import { TimetablePrintContent } from './TimetablePrintContent'
import { CleaningBoardPrintContent } from './CleaningBoardPrintContent'

type PrintMode = 'timetable' | 'cleaning-board' | null

// ロード完了後に initialValue で初期化し、key で再マウントする
function SafeBalanceCheckerInput({
  initialValue,
  onSave,
  disabled,
}: {
  initialValue: string
  onSave: (v: string) => Promise<void>
  disabled: boolean
}) {
  const [draft, setDraft] = useState(initialValue)

  const handleBlur = async () => {
    if (draft === initialValue) return
    await onSave(draft)
  }

  return (
    <TextField
      variant="standard"
      size="small"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void handleBlur()}
      disabled={disabled}
      placeholder="スタッフ名"
      sx={{ width: 160 }}
    />
  )
}

function SafeBalanceCheckerField({ date }: { date: string }) {
  const { staffName, isLoading, isPending, update } = useSafeBalanceChecker(date)

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: 2,
        '@media print': { display: 'none' },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        宿泊税締め担当
      </Typography>
      {isLoading ? (
        <CircularProgress size={16} />
      ) : (
        // key=staffName: fetch完了時に正しい initialValue で再マウント
        <SafeBalanceCheckerInput key={staffName} initialValue={staffName} onSave={update} disabled={isPending} />
      )}
    </Box>
  )
}

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
            component={NextLink}
            href="/a_tax_table"
            size="small"
            variant="text"
            sx={{ textTransform: 'none', fontSize: '0.9rem', color: 'text.secondary' }}
          >
            宿泊税管理
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon fontSize="small" />}
            onClick={() => setPrintMode('timetable')}
            data-testid="print-timetable"
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            タイムテーブル
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon fontSize="small" />}
            onClick={() => setPrintMode('cleaning-board')}
            data-testid="print-cleaning-board"
            sx={{ textTransform: 'none', fontSize: '0.8rem' }}
          >
            清掃ボード
          </Button>
        </Box>
      </Box>

      {/* safeBalanceChecker */}
      <SafeBalanceCheckerField date={selectedDate} />

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
          date={selectedDate}
          onPrintReady={() => window.print()}
          onAfterPrint={() => setPrintMode(null)}
        />
      )}
    </Box>
  )
}
