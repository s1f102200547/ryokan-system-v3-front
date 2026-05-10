'use client'

import type { ReactNode } from 'react'
import { useState, useCallback } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
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

function sortActiveByRoom(entries: DisplayEntry[]): DisplayEntry[] {
  return [...entries].sort((a, b) => {
    const ra = a.reservation.room ?? '9999'
    const rb = b.reservation.room ?? '9999'
    return ra.localeCompare(rb, undefined, { numeric: true })
  })
}

function sortByRoom(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort((a, b) => {
    const ra = a.room ?? '9999'
    const rb = b.room ?? '9999'
    return ra.localeCompare(rb, undefined, { numeric: true })
  })
}

export function GuestInfoSection({ selectedDate, topContent, sideContent, selectedToggle }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalReservation, setModalReservation] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
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

  const allActive = sortActiveByRoom([
    ...(data?.normal ?? []).map((r) => ({ reservation: r, isStaying: false })),
    ...(data?.staying ?? []).map((r) => ({ reservation: r, isStaying: true })),
  ])
  const cancelled = sortByRoom(data?.cancelled ?? [])
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
        {topContent}

        {/* アクティブな予約カード列（当日CI + 滞在中） */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0, justifyContent: 'center', mt: topContent ? 3 : 10 }}>
          {allActive.map(({ reservation, isStaying }) => (
            <ReservationListCard
              key={reservation.id}
              reservation={reservation}
              onClick={setModalReservation}
              onCancelOrRestore={setCancelTarget}
              isStaying={isStaying}
              selectedToggle={selectedToggle}
              targetDate={selectedDate}
            />
          ))}
          <AddReservationCard onClick={() => setAddDialogOpen(true)} />
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
                  />
                )}
              </Box>
              {sideContent}
            </Box>
          </Box>
        )}
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
