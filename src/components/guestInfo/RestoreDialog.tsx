'use client'

import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { useRestoreReservation } from '@/hooks/guestInfo/useRestoreReservation'
import type { Reservation } from '@/types/reservation'

type Props = {
  reservation: Reservation | null
  onClose: () => void
  onRestored: () => void
}

export function RestoreDialog({ reservation, onClose, onRestored }: Props) {
  const [staffName, setStaffName] = useState('')
  const [reason, setReason] = useState('')
  const { execute, isPending, error } = useRestoreReservation()

  const handleClose = () => {
    setStaffName('')
    setReason('')
    onClose()
  }

  const handleSubmit = async () => {
    if (!reservation) return
    const ok = await execute({
      id: reservation.id,
      staffName,
      targetDate: reservation.check_in_date,
      reason,
    })
    if (ok) {
      handleClose()
      onRestored()
    }
  }

  const canSubmit = staffName.trim().length > 0 && reason.trim().length > 0

  return (
    <Dialog open={Boolean(reservation)} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>キャンセル復活</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '20px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="スタッフ名"
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          size="small"
          fullWidth
          autoFocus
        />
        <TextField
          label="復活理由"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={2}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isPending}>キャンセル</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          startIcon={isPending ? <CircularProgress size={16} /> : undefined}
        >
          復活
        </Button>
      </DialogActions>
    </Dialog>
  )
}
