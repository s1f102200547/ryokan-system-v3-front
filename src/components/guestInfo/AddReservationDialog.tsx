'use client'

import { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { addDays } from '@/lib/dateUtils'
import { useAddReservation } from '@/hooks/guestInfo/useAddReservation'
import { ROOM_NUMBERS } from '@/constants/room'
import type { BookingSite } from '@/types/guestInfo'

type Props = {
  open: boolean
  checkInDate: string  // YYYY-MM-DD
  onClose: () => void
  onAdded: () => void
}

const BOOKING_SITES: { value: BookingSite; label: string }[] = [
  { value: 'chillnn',     label: 'Chillnn（A税不要）' },
  { value: 'booking.com', label: 'Booking.com' },
  { value: 'expedia',     label: 'Expedia' },
  { value: 'other',       label: 'その他' },
]

const COUNT_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: n, label: String(n) }))

export function AddReservationDialog({ open, checkInDate, onClose, onAdded }: Props) {
  const [checkOutDate, setCheckOutDate] = useState(addDays(checkInDate, 1))
  const [room, setRoom] = useState<string>('')
  const [adultCount, setAdultCount] = useState(1)
  const [childCount, setChildCount] = useState(0)
  const [guestName, setGuestName] = useState('')
  const [bookingSite, setBookingSite] = useState<BookingSite>('chillnn')
  const [addReason, setAddReason] = useState('')
  const { execute, isPending, error } = useAddReservation()

  const handleClose = () => {
    setCheckOutDate(addDays(checkInDate, 1))
    setRoom('')
    setAdultCount(1)
    setChildCount(0)
    setGuestName('')
    setBookingSite('chillnn')
    setAddReason('')
    onClose()
  }

  const handleSubmit = async () => {
    if (!room) return
    const result = await execute({
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      room: room as typeof ROOM_NUMBERS[number],
      adult_count: adultCount,
      child_count: childCount,
      guest_name: guestName,
      booking_site: bookingSite,
      add_reason: addReason,
    })
    if (result !== null) {
      handleClose()
      onAdded()
    }
  }

  const canSubmit =
    room !== '' &&
    guestName.trim().length > 0 &&
    addReason.trim().length > 0 &&
    checkOutDate > checkInDate

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>新規予約追加（C/I: {checkInDate}）</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="C/O 日"
          type="date"
          value={checkOutDate}
          onChange={(e) => setCheckOutDate(e.target.value)}
          size="small"
          fullWidth
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: addDays(checkInDate, 1) }}
        />

        <FormControl size="small" fullWidth>
          <InputLabel shrink>部屋</InputLabel>
          <Select
            value={room}
            label="部屋"
            onChange={(e) => setRoom(e.target.value)}
            displayEmpty
          >
            <MenuItem value=""><em>選択してください</em></MenuItem>
            {ROOM_NUMBERS.map((r) => (
              <MenuItem key={r} value={r}>{r}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="ゲスト名"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          size="small"
          fullWidth
          autoFocus
        />

        <FormControl size="small" fullWidth>
          <InputLabel shrink>大人人数</InputLabel>
          <Select
            value={adultCount}
            label="大人人数"
            onChange={(e) => setAdultCount(Number(e.target.value))}
          >
            {COUNT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" fullWidth>
          <InputLabel shrink>子供人数</InputLabel>
          <Select
            value={childCount}
            label="子供人数"
            onChange={(e) => setChildCount(Number(e.target.value))}
          >
            {COUNT_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>

        <FormControl size="small" fullWidth>
          <InputLabel shrink>予約サイト（A税の有無に影響）</InputLabel>
          <Select
            value={bookingSite}
            label="予約サイト（A税の有無に影響）"
            onChange={(e) => setBookingSite(e.target.value as BookingSite)}
          >
            {BOOKING_SITES.map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="追加理由"
          value={addReason}
          onChange={(e) => setAddReason(e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={2}
          placeholder="Slack通知にのみ使用されます"
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
          追加
        </Button>
      </DialogActions>
    </Dialog>
  )
}
