'use client'

import type { ReactNode } from 'react'
import { useState, useCallback } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { useGuestInfo } from '@/hooks/guestInfo/useGuestInfo'
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
        // その日のデータがない（初回・日付の切り替え）。前の日のカードは出さず、カードの形の仮表示にする
        <Box
          data-testid="guest-info-loading"
          aria-busy="true"
          aria-label="予約を読み込んでいます"
          sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', mt: topContent ? 3 : 10 }}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" width={120} height={120} sx={{ m: 1 }} />
          ))}
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

          {/* 同じ日の取り直し中（閉じる・追加・キャンセルの後）。前のカードを薄く出し、押せないようにする */}
          <Box sx={{ height: 4, mt: topContent ? 3 : 10, mb: -0.5 }}>
            {isRefreshing && <LinearProgress data-testid="guest-info-refreshing" aria-label="予約を取り直しています" />}
          </Box>

          {/* アクティブな予約カード列（当日CI + 滞在中） */}
          <Box
            aria-busy={isRefreshing}
            sx={{
              display: 'flex', flexWrap: 'wrap', gap: 0, justifyContent: 'center',
              opacity: isRefreshing ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {allActive.map(({ reservation, isStaying }) => (
              <Box
                key={reservation.id}
                sx={{ display: 'inline-flex' }}
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
            <AddReservationCard onClick={() => setAddDialogOpen(true)} disabled={isRefreshing} />
          </Box>

        {(cancelled.length > 0 || sideContent) && (
          <Box
            sx={{
              mt: 3,
              width: '70%',
              mx: 'auto',
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
