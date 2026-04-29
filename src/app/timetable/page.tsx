'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import GlobalStyles from '@mui/material/GlobalStyles'
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
import { Loading } from '@/components/Loading'
import { getTodayJST } from '@/lib/dateUtils'

function formatDateLabel(dateStr: string): string {
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
          top: 10,
          left: 10,
          transform: 'scale(0.9, 0.9)',
          transformOrigin: 'top left',
        },
      },
    }}
  />
)

function TimetablePage() {
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date')
  const targetDate = dateParam ?? getTodayJST()
  const autoprint = searchParams.get('autoprint') === '1'

  const { data, isLoading, error } = useTimetable(targetDate)
  const [printTime, setPrintTime] = useState<Date | null>(autoprint ? new Date() : null)
  const [isPrinting, setIsPrinting] = useState(autoprint)

  useEffect(() => {
    if (isPrinting && printTime && data) {
      const handleAfterPrint = () => setIsPrinting(false)
      window.addEventListener('afterprint', handleAfterPrint)
      window.print()
      return () => window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [isPrinting, printTime, data])

  const handlePrint = () => {
    setPrintTime(new Date())
    setIsPrinting(true)
  }

  const dateLabel = formatDateLabel(targetDate)
  const nextDateLabel = formatNextDateLabel(targetDate)
  const weekdayChecks = getWeekdayChecks(targetDate)

  if (isLoading) return <Loading />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!data) return null

  return (
    <>
      {printStyles}

      {/* 印刷時非表示のコントロール */}
      <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1 }}>
        <Button variant="contained" onClick={handlePrint}>
          印刷
        </Button>
      </Box>

      <Box className="print-area" sx={{ width: '95%', mx: 'auto', px: 1 }}>
        {/* 印刷時のみ表示する日時 */}
        <Box
          sx={{
            display: 'none',
            '@media print': { display: 'block' },
            fontSize: '10px',
            mb: 0.5,
          }}
        >
          {printTime?.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }) ?? ''}
        </Box>

        {/* ヘッダー行: 日付 + 曜日チェック */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Box data-testid="timetable-date" sx={{ fontSize: '20px', fontWeight: 'bold' }}>
            {dateLabel}
          </Box>
          <Box data-testid="weekday-checks" sx={{ fontSize: '12px' }}>
            {weekdayChecks}
          </Box>
        </Box>

        {/* 連泊ゲスト表示（日付-到着の間） */}
        <Box sx={{ mb: 0.5 }}>
          <StayingGuests stayingGuestLabels={data.stayingGuestLabels} />
        </Box>

        {/* メイングリッド */}
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

          {/* 朝食ヘッダー + 朝食テーブル（くっつけて1エリアに） */}
          <Box sx={{ gridArea: 'bf' }}>
            <BreakfastHeader nextDateLabel={nextDateLabel} />
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Breakfast breakfastSlots={data.breakfastSlots} />
              <CheckoutNotice checkoutRooms={data.checkoutRooms} />
            </Box>
          </Box>

          {/* 露天 + C/O（くっつけて1エリアに、朝食との間は若干空ける） */}
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
      </Box>
    </>
  )
}

export default function TimetablePageWrapper() {
  return (
    <Suspense fallback={<Loading />}>
      <TimetablePage />
    </Suspense>
  )
}
