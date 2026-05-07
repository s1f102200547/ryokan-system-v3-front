'use client'

import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { useCancelReservation } from '@/hooks/guestInfo/useCancelReservation'
import type { Reservation } from '@/types/reservation'

type Props = {
  reservation: Reservation | null
  onClose: () => void
  onCancelled: () => void
}

export function CancelDialog({ reservation, onClose, onCancelled }: Props) {
  const [step, setStep] = useState<'confirm' | 'reason'>('confirm')
  const [staffName, setStaffName] = useState('')
  const [reason, setReason] = useState('')
  const { execute, isPending, error } = useCancelReservation()

  const handleClose = () => {
    setStep('confirm')
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
      onCancelled()
    }
  }

  const canSubmit = staffName.trim().length > 0 && reason.trim().length > 0

  return (
    <Dialog open={Boolean(reservation)} onClose={handleClose} maxWidth="xs" fullWidth>
      {step === 'confirm' ? (
        <>
          <DialogTitle>キャンセル確認</DialogTitle>
          <DialogContent>
            <Typography>
              {reservation?.room} ／ {reservation?.guest_name} をキャンセルしますか？
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>戻る</Button>
            <Button variant="contained" color="error" onClick={() => setStep('reason')}>
              はい
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogTitle>キャンセル理由を入力</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
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
              label="キャンセル理由"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStep('confirm')} disabled={isPending}>戻る</Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              startIcon={isPending ? <CircularProgress size={16} /> : undefined}
            >
              キャンセル実行
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}
