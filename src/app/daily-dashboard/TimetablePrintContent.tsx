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
import { CheckoutNotice } from '@/components/timetable/CheckoutNotice'
import { OpenAirBathMorning } from '@/components/timetable/OpenAirBathMorning'
import { CheckoutTime } from '@/components/timetable/CheckoutTime'
import { StayingGuests } from '@/components/timetable/StayingGuests'

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

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Box data-testid="timetable-date" sx={{ fontSize: '20px', fontWeight: 'bold' }}>
            {dateLabel}
          </Box>
          <Box data-testid="weekday-checks" sx={{ fontSize: '12px' }}>
            {weekdayChecks}
          </Box>
        </Box>

        {data && (
          <>
            <Box sx={{ mb: 0.5 }}>
              <StayingGuests stayingGuestLabels={data.stayingGuestLabels} />
            </Box>

            <Box
              component="section"
              sx={{
                display: 'grid',
                rowGap: 0,
                gridTemplateColumns: '2.5fr 5fr 2.5fr',
                gridTemplateAreas: `
                  "checkin  checkin  checkin"
                  "evening  evening  evening"
                  "number   dinner   guestinfo"
                  "bf       bf       guestinfo"
                  "bathco   bathco   guestinfo"
                `,
              }}
            >
              <Box sx={{ gridArea: 'checkin' }}>
                <CheckInTime checkInSlots={data.checkInSlots} />
              </Box>
              <Box sx={{ gridArea: 'evening' }}>
                <OpenAirBathEvening eveningBathSlots={data.eveningBathSlots} />
              </Box>
              <Box sx={{ gridArea: 'number' }}>
                <NumberOfBreakfast />
              </Box>
              <Box sx={{ gridArea: 'dinner' }}>
                <Dinner dinnerSlots={data.dinnerSlots} />
              </Box>
              <Box sx={{ gridArea: 'guestinfo' }}>
                <GuestInfo guestInfoRows={data.guestInfoRows} />
              </Box>
              <Box sx={{ gridArea: 'bf' }}>
                <BreakfastHeader nextDateLabel={nextDateLabel} />
                <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Breakfast breakfastSlots={data.breakfastSlots} />
                  <CheckoutNotice checkoutRooms={data.checkoutRooms} />
                </Box>
              </Box>
              <Box sx={{ gridArea: 'bathco', mt: 1 }}>
                <Box sx={{ position: 'relative' }}>
                  <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', pr: '2px', whiteSpace: 'nowrap' }}>
                    露天
                  </Box>
                  <OpenAirBathMorning morningBathSlots={data.morningBathSlots} />
                </Box>
                <Box sx={{ position: 'relative' }}>
                  <Box sx={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', pr: '2px', whiteSpace: 'nowrap' }}>
                    C/O
                  </Box>
                  <CheckoutTime lateCheckoutRooms={data.lateCheckoutRooms} />
                </Box>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </>
  )
}
