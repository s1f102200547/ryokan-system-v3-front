'use client'

import type { ReactNode } from 'react'
import { useState, useCallback } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { useGuestInfo } from '@/hooks/guestInfo/useGuestInfo'
import { DelayedSpinner } from '@/components/DelayedSpinner'
import { ReservationListCard } from './ReservationListCard'
import { AddReservationCard } from './AddReservationCard'
import { ReservationModal } from './ReservationModal'
import { CancelDialog } from './CancelDialog'
import { AddReservationDialog } from './AddReservationDialog'
import { CancelledSection } from './CancelledSection'
import type { Reservation } from '@/types/reservation'
import type { GuestInfoToggle } from '@/types/guestInfo'

type Props = {
  selectedDate: string
  topContent?: ReactNode
  sideContent?: ReactNode
  selectedToggle?: GuestInfoToggle | null
}

type DisplayEntry = { reservation: Reservation; isStaying: boolean }

// カード1枚分の高さ（120px + 上下の余白 8px × 2）。待っている間もこの高さを取っておき、届いたときに下がずれないようにする
const CARD_ROW_HEIGHT = 136

// 届いたカードを少しずつずらしてフェードインさせる。待ちが 1 秒未満でも「読み込んだ → 出た」がつながって見える
const FADE_IN_MS = 180
const FADE_IN_STAGGER_MS = 25
// fill-mode は backwards（ずらしている間は透明にし、終わったら要素自身のスタイルに戻す）。
// both にすると終わりの opacity: 1 が残り、取り直し中に薄くする opacity を上書きする
const fadeInSx = (index: number) => ({
  animation: `guestCardIn ${FADE_IN_MS}ms ease-out backwards`,
  animationDelay: `${index * FADE_IN_STAGGER_MS}ms`,
  '@keyframes guestCardIn': {
    from: { opacity: 0, transform: 'translateY(4px)' },
    to: { opacity: 1, transform: 'none' },
  },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
})

function compareRoom(a: Reservation, b: Reservation): number {
  const ra = a.room ?? '9999'
  const rb = b.room ?? '9999'
  return ra.localeCompare(rb, undefined, { numeric: true })
}

function sortByRoom(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort((a, b) => {
    return compareRoom(a, b)
  })
}

export function GuestInfoSection({ selectedDate, topContent, sideContent, selectedToggle }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalReservation, setModalReservation] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null)

  const { data, isLoading, isRefreshing, error, loadedDate } = useGuestInfo(selectedDate, refreshKey)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleCancelled = useCallback(() => {
    setCancelTarget(null)
    refresh()
    setSnackbarMessage('キャンセルしました')
  }, [refresh])

  const handleAdded = useCallback(() => {
    refresh()
    setSnackbarMessage('予約を追加しました')
  }, [refresh])

  const displayDate = loadedDate ?? selectedDate
  const allActive: DisplayEntry[] = [
    ...(data?.normal ?? []).map((r) => ({ reservation: r, isStaying: false })),
    ...(data?.staying ?? []).map((r) => ({ reservation: r, isStaying: true })),
  ].sort((a, b) => compareRoom(a.reservation, b.reservation))
  const cancelled = sortByRoom(data?.cancelled ?? [])

  return (
    <Box>
      {topContent}

      {isLoading ? (
        // その日のデータがない（初回・日付の切り替え）。前の日のカードは出さない。
        // 待ちは 1 秒未満がほとんどなので、高さだけ取っておき、0.5 秒を超えたらスピナーを出す
        <Box
          data-testid="guest-info-loading"
          aria-busy="true"
          sx={{ minHeight: CARD_ROW_HEIGHT, mt: topContent ? 3 : 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          <DelayedSpinner label="予約を読み込んでいます" />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
      ) : (
        <>
          {/* 同じ部屋・同じ夜に有効な予約が2件以上（清掃ボード・タイムテーブルには1件しか出ない） */}
          {(data?.roomConflicts ?? []).length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }} data-testid="room-conflict-alert">
              {`部屋が重複しています: ${(data?.roomConflicts ?? []).map((c) => `${c.room}号室（${c.reservationIds.length}件）`).join('、')}。`
                + '清掃ボードとタイムテーブルには1件しか表示されません。部屋の割り当てを確認してください。'}
            </Alert>
          )}

          {/* アクティブな予約カード列（当日CI + 滞在中）。
              同じ日の取り直し中（閉じる・追加・キャンセルの後）は、前のカードを薄く出し、押せないようにする */}
          <Box sx={{ position: 'relative', mt: topContent ? 3 : 10 }}>
          {/* 取り直しが 0.5 秒を超えたら、薄くしたカードの上にスピナーを重ねる */}
          {isRefreshing && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1, pointerEvents: 'none' }}>
              <DelayedSpinner label="予約を取り直しています" />
            </Box>
          )}
          <Box
            data-testid="guest-info-cards"
            data-refreshing={isRefreshing ? 'true' : 'false'}
            aria-busy={isRefreshing}
            sx={{
              display: 'flex', flexWrap: 'wrap', gap: 0, justifyContent: 'center',
              minHeight: CARD_ROW_HEIGHT,
              opacity: isRefreshing ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {allActive.map(({ reservation, isStaying }, index) => (
              <Box
                key={reservation.id}
                sx={{ display: 'inline-flex', ...fadeInSx(index) }}
              >
                <ReservationListCard
                  reservation={reservation}
                  onClick={setModalReservation}
                  onCancelOrRestore={setCancelTarget}
                  isStaying={isStaying}
                  selectedToggle={selectedToggle}
                  targetDate={displayDate}
                  disabled={isRefreshing}
                />
              </Box>
            ))}
            <Box sx={{ display: 'inline-flex', ...fadeInSx(allActive.length) }}>
              <AddReservationCard onClick={() => setAddDialogOpen(true)} disabled={isRefreshing} />
            </Box>
          </Box>
          </Box>

        {(cancelled.length > 0 || sideContent) && (
          <Box
            sx={{
              mt: 3,
              width: '70%',
              mx: 'auto',
              opacity: isRefreshing ? 0.5 : 1,
              transition: 'opacity 0.15s',
              ...fadeInSx(allActive.length + 1),
            }}
          >
            {cancelled.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                キャンセル済み
              </Typography>
            )}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 3,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ minWidth: '240px', visibility: cancelled.length > 0 ? 'visible' : 'hidden' }}>
                {cancelled.length > 0 && (
                  <CancelledSection
                    reservations={cancelled}
                    onCardClick={setModalReservation}
                    onRestore={() => undefined}
                    showRestoreAction={false}
                    hideTitle
                    disabled={isRefreshing}
                  />
                )}
              </Box>
              {sideContent}
            </Box>
          </Box>
          )}
        </>
      )}

      {/* モーダル / ダイアログ */}
      <ReservationModal
        reservation={modalReservation}
        onClose={() => { setModalReservation(null); refresh() }}
      />

      <CancelDialog
        reservation={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={handleCancelled}
      />

      <AddReservationDialog
        open={addDialogOpen}
        checkInDate={selectedDate}
        onClose={() => setAddDialogOpen(false)}
        onAdded={handleAdded}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Box>
  )
}
