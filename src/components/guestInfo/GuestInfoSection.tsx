'use client'

import { useState, useCallback } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import { useGuestInfo } from '@/hooks/guestInfo/useGuestInfo'
import { ReservationListCard } from './ReservationListCard'
import { AddReservationCard } from './AddReservationCard'
import { CancelledSection } from './CancelledSection'
import { ReservationModal } from './ReservationModal'
import { CancelDialog } from './CancelDialog'
import { RestoreDialog } from './RestoreDialog'
import { AddReservationDialog } from './AddReservationDialog'
import type { Reservation } from '@/types/reservation'

type Props = {
  selectedDate: string
}

function sortByRoom(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort((a, b) => {
    const ra = a.room ?? '9999'
    const rb = b.room ?? '9999'
    return ra.localeCompare(rb, undefined, { numeric: true })
  })
}

export function GuestInfoSection({ selectedDate }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalReservation, setModalReservation] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Reservation | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null)

  const { data, isLoading, error, loadedDate } = useGuestInfo(selectedDate, refreshKey)

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

  // data === null は初回ロードのみ。refresh 中は data が残るので UI を保持し Snackbar を消さない
  if (isLoading && data === null) {
    return (
      <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!isLoading && error) {
    return <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
  }

  const normal = sortByRoom(data?.normal ?? [])
  const cancelled = data?.cancelled ?? []
  const isShowingStaleData = isLoading && data !== null && loadedDate !== selectedDate

  return (
    <Box>
      <Box
        key={loadedDate ?? 'guest-info-empty'}
        sx={{
          opacity: isShowingStaleData ? 0.35 : 1,
          animation: isShowingStaleData ? 'none' : 'guestInfoFadeIn 180ms ease-out',
          transition: 'opacity 120ms ease-out',
          '@keyframes guestInfoFadeIn': {
            from: { opacity: 0.35, transform: 'translateY(4px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        }}
      >
        {/* アクティブな予約カード列 */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0, justifyContent: 'center', mt: 10 }}>
          {normal.map((r) => (
            <ReservationListCard
              key={r.id}
              reservation={r}
              onClick={setModalReservation}
              onCancelOrRestore={setCancelTarget}
            />
          ))}
          <AddReservationCard onClick={() => setAddDialogOpen(true)} />
        </Box>

        {/* キャンセル済み */}
        <CancelledSection
          reservations={cancelled}
          onCardClick={setModalReservation}
          onRestore={setRestoreTarget}
        />
      </Box>

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

      <RestoreDialog
        reservation={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onRestored={() => { setRestoreTarget(null); refresh() }}
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
