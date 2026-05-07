'use client'

import { useState, useCallback } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
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

export function GuestInfoSection({ selectedDate }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalReservation, setModalReservation] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Reservation | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const { data, isLoading, error } = useGuestInfo(selectedDate, refreshKey)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleMutation = useCallback(() => {
    setModalReservation(null)
    refresh()
  }, [refresh])

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
  }

  const normal = data?.normal ?? []
  const cancelled = data?.cancelled ?? []

  return (
    <Box>
      {/* アクティブな予約カード列 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
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

      {/* モーダル / ダイアログ */}
      <ReservationModal
        reservation={modalReservation}
        onClose={() => setModalReservation(null)}
      />

      <CancelDialog
        reservation={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={handleMutation}
      />

      <RestoreDialog
        reservation={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onRestored={handleMutation}
      />

      <AddReservationDialog
        open={addDialogOpen}
        checkInDate={selectedDate}
        onClose={() => setAddDialogOpen(false)}
        onAdded={refresh}
      />
    </Box>
  )
}
