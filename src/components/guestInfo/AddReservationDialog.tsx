'use client'

import { useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { useAddReservation } from '@/hooks/guestInfo/useAddReservation'
import { ROOM_NUMBERS } from '@/constants/room'
import type { BookingSite } from '@/types/guestInfo'
import { bookingSiteOptions, countOptions, MAX_NIGHTS } from '@/constants/guestInfo'

type Props = {
  open: boolean
  checkInDate: string  // YYYY-MM-DD
  onClose: () => void
  onAdded: () => void
}

// 入力の状態は中身（AddReservationForm）が持ち、開くたびに key を変えて作り直す。
// 以前はこの部品が状態を持ち、画面に出たままだったため、C/O 日の初期値が最初に開いた日のまま残り
// （4/12 を開いてから 4/10 で追加すると C/O 4/13 = 3泊）、失敗したときのエラーも開き直すと残っていた。
// Dialog は閉じると中身を外すが、閉じるアニメーションの間に開き直すと外れないので、key でも作り直す
export function AddReservationDialog({ open, checkInDate, onClose, onAdded }: Props) {
  const [openCount, setOpenCount] = useState(open ? 1 : 0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount((n) => n + 1)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <AddReservationForm key={openCount} checkInDate={checkInDate} onClose={onClose} onAdded={onAdded} />
    </Dialog>
  )
}

function AddReservationForm({ checkInDate, onClose, onAdded }: Omit<Props, 'open'>) {
  const [checkOutDate, setCheckOutDate] = useState<Dayjs | null>(dayjs(checkInDate).add(1, 'day'))
  const [room, setRoom] = useState<string>('')
  const [adultCount, setAdultCount] = useState(1)
  const [childCount, setChildCount] = useState(0)
  const [guestName, setGuestName] = useState('')
  const [bookingSite, setBookingSite] = useState<BookingSite>('chillnn')
  const [addReason, setAddReason] = useState('')
  const [staffName, setStaffName] = useState('')
  const { execute, isPending, error } = useAddReservation()

  const handleSubmit = async () => {
    if (!room || !checkOutDate) return
    const checkOutStr = checkOutDate.format('YYYY-MM-DD')
    const result = await execute({
      check_in_date: checkInDate,
      check_out_date: checkOutStr,
      room: room as typeof ROOM_NUMBERS[number],
      adult_count: adultCount,
      child_count: childCount,
      guest_name: guestName,
      booking_site: bookingSite,
      add_reason: addReason,
      staff_name: staffName,
    })
    if (result !== null) {
      onClose()
      onAdded()
    }
  }

  // 直接入力の途中の値は 'Invalid Date' になり、文字列比較では C/I より後と判定されてしまうため isValid も見る
  const checkOutStr = checkOutDate?.isValid() ? checkOutDate.format('YYYY-MM-DD') : ''
  const canSubmit =
    room !== '' &&
    guestName.trim().length > 0 &&
    addReason.trim().length > 0 &&
    staffName.trim().length > 0 &&
    checkOutStr > checkInDate &&
    checkOutStr <= dayjs(checkInDate).add(MAX_NIGHTS, 'day').format('YYYY-MM-DD')

  return (
    <>
      <DialogTitle>新規予約追加（C/I: {checkInDate}）</DialogTitle>
      <DialogContent sx={{ pt: '24px !important' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* フィールド順: C/O日→ゲスト名→大人人数→子供人数→部屋→予約サイト→追加理由 */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <DatePicker
            label="C/O 日"
            value={checkOutDate}
            onChange={(v) => setCheckOutDate(v)}
            minDate={dayjs(checkInDate).add(1, 'day')}
            maxDate={dayjs(checkInDate).add(MAX_NIGHTS, 'day')}
            slotProps={{ textField: { size: 'small', fullWidth: true } }}
          />

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
              {countOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel shrink>子供人数</InputLabel>
            <Select
              value={childCount}
              label="子供人数"
              onChange={(e) => setChildCount(Number(e.target.value))}
            >
              {countOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>

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

          <FormControl size="small" fullWidth>
            <InputLabel shrink>予約サイト（A税の有無に影響）</InputLabel>
            <Select
              value={bookingSite}
              label="予約サイト（A税の有無に影響）"
              onChange={(e) => setBookingSite(e.target.value as BookingSite)}
            >
              {bookingSiteOptions.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="担当スタッフ名"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            size="small"
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="追加理由"
            value={addReason}
            onChange={(e) => setAddReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={1}
            placeholder="ex. アプリのバグのため / 部屋移動のため"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ gridColumn: '1 / -1' }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isPending}>キャンセル</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          startIcon={isPending ? <CircularProgress size={16} /> : undefined}
        >
          追加
        </Button>
      </DialogActions>
    </>
  )
}
