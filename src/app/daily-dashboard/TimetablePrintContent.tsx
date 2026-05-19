'use client'

import { useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Backdrop from '@mui/material/Backdrop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import GlobalStyles from '@mui/material/GlobalStyles'
import Typography from '@mui/material/Typography'
import { useTimetable } from '@/hooks/timetable/useTimetable'
import { CheckInTime } from '@/components/timetable/CheckInTime'
import { OpenAirBathEvening } from '@/components/timetable/OpenAirBathEvening'
import { NumberOfBreakfast } from '@/components/timetable/NumberOfBreakfast'
import { Dinner } from '@/components/timetable/Dinner'
import { GuestInfo } from '@/components/timetable/GuestInfo'
import { BreakfastHeader } from '@/components/timetable/BreakfastHeader'
import { Breakfast } from '@/components/timetable/Breakfast'
import { OpenAirBathMorning } from '@/components/timetable/OpenAirBathMorning'
import { CheckoutTime } from '@/components/timetable/CheckoutTime'

type Props = {
  date: string
  onPrintReady: () => void
  onAfterPrint: () => void
}

function formatTimetableDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${month}/${day} (${wd})`
}

function formatNextDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day + 1)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getWeekdayChecks(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const wd = d.getDay()
  if (wd === 0) return '▢資源ごみ　▢ニゴウ情報送信　▢61布団'
  if (wd === 1) return '▢リネン発注　▢ニゴウ情報送信　▢61布団'
  return '▢ニゴウ情報送信　▢61布団'
}

function buildChecksLabel(weekdayChecks: string, userTodos: { text: string }[]): string {
  if (userTodos.length === 0) return weekdayChecks
  const userPart = userTodos.map((t) => `▢${t.text}`).join('　')
  return `${userPart}　${weekdayChecks}`
}

const printStyles = (
  <GlobalStyles
    styles={{
      '@page': { margin: 0 },
      '@media print': {
        'html, body': { margin: 0, padding: 0 },
        '.no-print': { display: 'none !important' },
        '.print-area': {
          position: 'absolute',
          top: 30,
          left: 30,
          transform: 'scale(0.9, 0.9)',
          transformOrigin: 'top left',
        },
      },
    }}
  />
)

export function TimetablePrintContent({ date, onPrintReady, onAfterPrint }: Props) {
  const { data, isLoading, error } = useTimetable(date)

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

  const dateLabel = formatTimetableDateLabel(date)
  const nextDateLabel = formatNextDateLabel(date)
  const weekdayChecks = getWeekdayChecks(date)
  const printTime = new Date()

  return (
    <>
      {printStyles}

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

      {/* 印刷コンテンツ（スクリーンでは非表示、印刷時のみ表示） */}
      <Box
        className="print-area"
        sx={{
          '@media screen': { display: 'none' },
          '@media print': { display: 'block' },
          width: '95%',
          mx: 'auto',
          px: 1,
        }}
      >
        <Box
          sx={{
            display: 'none',
            '@media print': { display: 'block' },
            fontSize: '10px',
            mb: 0.5,
          }}
        >
          {printTime.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '2.5fr 5fr 2.5fr', alignItems: 'center', mb: 0.5 }}>
          <Box data-testid="timetable-date" sx={{ fontSize: '20px', fontWeight: 'bold' }}>
            {dateLabel}
          </Box>
          <Box data-testid="weekday-checks" sx={{ gridColumn: '3', ml: -10, fontSize: '12px' }}>
            {data ? buildChecksLabel(weekdayChecks, data.todos ?? []) : weekdayChecks}
          </Box>
        </Box>

        {data && (
          <>
            <Box
              component="section"
              sx={{
                display: 'grid',
                rowGap: 0,
                gridTemplateColumns: '2.5fr 5fr 2.5fr',
                gridTemplateAreas: `
                  "checkin  checkin  checkin"
                  "evening  evening  evening"
                  "dinner   dinner   guestinfo"
                  "bf       bf       guestinfo"
                  "bathco   bathco   guestinfo"
                `,
              }}
            >
              <Box sx={{ gridArea: 'checkin', width: '62%', position: 'relative', ml: 2 }}>
                <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, pr: '6px', whiteSpace: 'nowrap' }}>
                  到着
                </Box>
                <CheckInTime checkInSlots={data.checkInSlots} />
              </Box>
              <Box sx={{ gridArea: 'evening', position: 'relative', ml: 2 }}>
                <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, pr: '6px', whiteSpace: 'nowrap' }}>
                  露天
                </Box>
                <OpenAirBathEvening eveningBathSlots={data.eveningBathSlots} />
              </Box>
              <Box sx={{ gridArea: 'dinner', position: 'relative', ml: 2 }}>
                <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, pr: '6px', whiteSpace: 'nowrap' }}>
                  夕食
                </Box>
                <Dinner dinnerSlots={data.dinnerSlots} />
              </Box>
              <Box sx={{ gridArea: 'guestinfo', gridColumn: '3', gridRow: '1 / -1', width: '90%', height: '100%', alignSelf: 'stretch', ml: -10 }}>
                <GuestInfo guestInfoRows={data.guestInfoRows} />
              </Box>
              <Box sx={{ gridArea: 'bf', position: 'relative', ml: 2 }}>
                <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, pr: '6px', whiteSpace: 'nowrap' }}>
                  朝食
                </Box>
                <Box sx={{ mt: 2}}>
                  <Box sx={{ fontSize: '11px', lineHeight: 1.35 }}>{nextDateLabel}</Box>
                  <NumberOfBreakfast />
                </Box>
                <BreakfastHeader />
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Breakfast breakfastSlots={data.breakfastSlots} />
                </Box>
              </Box>
              <Box sx={{ gridArea: 'bathco', mt: 1 }}>
                <Box sx={{ position: 'relative', mb: 1, ml: 2 }}>
                  <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, pr: '6px', whiteSpace: 'nowrap' }}>
                    露天
                  </Box>
                  <OpenAirBathMorning morningBathSlots={data.morningBathSlots} />
                </Box>
                <Box sx={{ position: 'relative', ml: 2 }}>
                  <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', fontWeight: 700, pr: '6px', whiteSpace: 'nowrap' }}>
                    C/O
                  </Box>
                  <CheckoutTime
                    checkoutRooms={data.checkoutRooms}
                    lateCheckoutRooms={data.lateCheckoutRooms}
                  />
                </Box>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </>
  )
}
