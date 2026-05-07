'use client'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CancelIcon from '@mui/icons-material/Cancel'
import RestoreIcon from '@mui/icons-material/RestoreFromTrash'
import type { Reservation } from '@/types/reservation'

type Props = {
  reservation: Reservation
  onClick: (r: Reservation) => void
  onCancelOrRestore: (r: Reservation) => void
  isCancelled?: boolean
}

export function ReservationListCard({ reservation, onClick, onCancelOrRestore, isCancelled = false }: Props) {
  return (
    <Card
      onClick={() => onClick(reservation)}
      data-testid="reservation-card"
      sx={{
        position: 'relative',
        width: 120,
        height: 120,
        m: 1,
        cursor: 'pointer',
        bgcolor: isCancelled ? 'grey.100' : 'background.paper',
        opacity: isCancelled ? 0.6 : 1,
        transition: 'background-color 0.2s',
        '&:hover': { bgcolor: isCancelled ? 'grey.200' : 'grey.100' },
        '&:active': { bgcolor: 'grey.200' },
      }}
    >
      <IconButton
        size="small"
        data-testid={isCancelled ? 'restore-button' : 'cancel-button'}
        onClick={(e) => {
          e.stopPropagation()
          onCancelOrRestore(reservation)
        }}
        sx={{ position: 'absolute', top: -5, right: -5, minWidth: 'auto' }}
      >
        {isCancelled
          ? <RestoreIcon sx={{ fontSize: 13 }} />
          : <CancelIcon sx={{ fontSize: 13 }} />
        }
      </IconButton>
      <CardContent sx={{ textAlign: 'center', p: 1 }}>
        <Typography variant="h5">{reservation.room ?? '—'}</Typography>
        <Typography variant="body2" noWrap>{reservation.guest_name || '（名前なし）'}</Typography>
      </CardContent>
    </Card>
  )
}
