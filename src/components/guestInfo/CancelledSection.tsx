'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { ReservationListCard } from './ReservationListCard'
import type { Reservation } from '@/types/reservation'

type Props = {
  reservations: Reservation[]
  onCardClick: (reservation: Reservation) => void
  onRestore: (reservation: Reservation) => void
}

export function CancelledSection({ reservations, onCardClick, onRestore }: Props) {
  if (reservations.length === 0) return null

  return (
    <Box data-testid="cancelled-section" sx={{ mt: 3, width: '50%', mx: 'auto' }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        キャンセル済み
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
        {reservations.map((r) => (
          <ReservationListCard
            key={r.id}
            reservation={r}
            onClick={() => onCardClick(r)}
            onCancelOrRestore={() => onRestore(r)}
            isCancelled
          />
        ))}
      </Box>
    </Box>
  )
}
