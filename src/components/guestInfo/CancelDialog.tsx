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
import { useCancelReservation } from '@/hooks/guestInfo/useCancelReservation'
import type { Reservation } from '@/types/reservation'

type Props = {
  reservation: Reservation | null
  onClose: () => void
  onCancelled: () => void
}

// 入力とエラーは中身（CancelForm）が持ち、開くたびに key を変えて作り直す。
// 以前はこの部品が持ち、失敗したときのエラーが、閉じて別の予約で開き直しても残っていた
export function CancelDialog({ reservation, onClose, onCancelled }: Props) {
  const open = reservation !== null
  // 閉じるアニメーションの間も題名を出せるよう、最後に開いた予約を覚えておく
  const [shown, setShown] = useState<Reservation | null>(reservation)
  if (reservation !== null && reservation !== shown) setShown(reservation)
  // 閉じた → 開いた、のたびに数える（同じ予約で開き直しても作り直す）
  const [openCount, setOpenCount] = useState(open ? 1 : 0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount((n) => n + 1)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      {shown && <CancelForm key={`${openCount}-${shown.id}`} reservation={shown} onClose={onClose} onCancelled={onCancelled} />}
    </Dialog>
  )
}

function CancelForm({ reservation, onClose, onCancelled }: { reservation: Reservation; onClose: () => void; onCancelled: () => void }) {
  const [staffName, setStaffName] = useState('')
  const [reason, setReason] = useState('')
  const { execute, isPending, error } = useCancelReservation()

  const handleSubmit = async () => {
    const ok = await execute({
      id: reservation.id,
      staffName,
      targetDate: reservation.check_in_date,
      reason,
    })
    if (ok) {
      onClose()
      onCancelled()
    }
  }

  const canSubmit = staffName.trim().length > 0 && reason.trim().length > 0

  return (
    <>
      <DialogTitle>
        キャンセル — {reservation.room} ／ {reservation.guest_name}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '30px !important' }}>
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
          placeholder="ex. アプリのバグのため / no show のため"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={2}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>戻る</Button>
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
  )
}
