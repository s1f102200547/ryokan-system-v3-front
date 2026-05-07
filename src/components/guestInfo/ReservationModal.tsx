'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import CloudDoneIcon from '@mui/icons-material/CloudDone'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { debounce } from '@/lib/debounce'
import { dateDiff } from '@/lib/dateUtils'
import { resizeNightFields } from '@/domain/reservation/nightArrays'
import { useUpdateReservation } from '@/hooks/guestInfo/useUpdateReservation'
import { ReservationCardSet1 } from './cardset1/ReservationCardSet1'
import { ReservationCardSet2 } from './cardset2/ReservationCardSet2'
import type { Reservation } from '@/types/reservation'
import type { ReservationPatch } from '@/types/guestInfo'
import type { SaveStatus } from '@/hooks/guestInfo/useUpdateReservation'

type Props = {
  reservation: Reservation | null
  onClose: () => void
}

export function ReservationModal({ reservation, onClose }: Props) {
  if (!reservation) return null
  return <ModalBody key={reservation.id} reservation={reservation} onClose={onClose} />
}

const SAVE_DEBOUNCE_MS = 500

type DebouncedFn = ((id: string) => void) & { flush: () => void; cancel: () => void }

function ModalBody({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  const [tab, setTab] = useState<number>(0)
  const [localData, setLocalData] = useState<Reservation>(reservation)

  const pendingPayloadRef = useRef<ReservationPatch>({})
  const { execute, saveStatus, error, clearError } = useUpdateReservation()
  const debouncedUpdateRef = useRef<DebouncedFn | null>(null)

  useEffect(() => {
    const fn = debounce((id: string) => {
      const payload = pendingPayloadRef.current
      if (Object.keys(payload).length === 0) return
      pendingPayloadRef.current = {}
      void execute(id, payload)
    }, SAVE_DEBOUNCE_MS)
    debouncedUpdateRef.current = fn
    return () => fn.cancel()
  }, [execute])

  const handleClose = useCallback(() => {
    const fn = debouncedUpdateRef.current
    if (fn) {
      if (Object.keys(pendingPayloadRef.current).length > 0) {
        fn.flush()
      } else {
        fn.cancel()
      }
    }
    onClose()
  }, [onClose])

  // Step 54: onBlur on any input field immediately flushes pending debounced save
  const handleBlurFlush = useCallback(() => {
    debouncedUpdateRef.current?.flush()
  }, [])

  const handleFieldChange = useCallback(
    (field: keyof ReservationPatch, value: unknown) => {
      let patch: ReservationPatch = { [field]: value }

      if (field === 'check_out_date' && typeof value === 'string') {
        const newNights = dateDiff(localData.check_in_date, value)
        if (newNights > 0) {
          const resized = resizeNightFields(
            {
              dinner_time: localData.dinner_time,
              dinner_info: localData.dinner_info,
              breakfast_time: localData.breakfast_time,
              open_air_bath_time: localData.open_air_bath_time,
              timetable_info: localData.timetable_info,
            },
            newNights,
          )
          patch = { ...patch, ...resized }
        }
      }

      pendingPayloadRef.current = { ...pendingPayloadRef.current, ...patch }
      setLocalData((prev) => ({ ...prev, ...patch }))
      debouncedUpdateRef.current?.(localData.id)
    },
    [localData],
  )

  const nights = dateDiff(localData.check_in_date, localData.check_out_date)

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { height: 600, display: 'flex', flexDirection: 'column' } } }}
    >
      <DialogTitle sx={{ position: 'relative', display: 'flex', alignItems: 'center', py: 0.5, px: 2, minHeight: 32 }}>
        {/* 左: 部屋 / ゲスト名 */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {localData.room ?? '部屋未定'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {localData.guest_name || '（名前未記入）'}
          </Typography>
        </Box>

        {/* 中央: ToggleButton タブ */}
        <ToggleButtonGroup
          value={tab}
          exclusive
          onChange={(_, v: number | null) => { if (v !== null) setTab(v) }}
          size="small"
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <ToggleButton value={0} sx={{ px: 2, py: 0.25, fontSize: '0.8rem' }}>
            C/I前
          </ToggleButton>
          <ToggleButton value={1} sx={{ px: 2, py: 0.25, fontSize: '0.8rem' }}>
            C/I後
          </ToggleButton>
        </ToggleButtonGroup>

        {/* 右: 保存ステータス + 閉じるボタン */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
          <SaveStatusIcon status={saveStatus} />
          <IconButton
            onClick={handleClose}
            aria-label="閉じる"
            sx={{ p: 2 }}
          >
            <CloseIcon fontSize="medium" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent
        sx={{ flex: 1, p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          {tab === 0 && (
            <ReservationCardSet1
              localData={localData}
              nights={nights}
              onFieldChange={handleFieldChange}
              onBlurFlush={handleBlurFlush}
            />
          )}
          {tab === 1 && (
            <ReservationCardSet2
              localData={localData}
              onFieldChange={handleFieldChange}
              onBlurFlush={handleBlurFlush}
            />
          )}
        </Box>
      </DialogContent>

      <Snackbar
        open={saveStatus === 'error' && error !== null}
        autoHideDuration={5000}
        onClose={clearError}
        message={error}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Dialog>
  )
}

function SaveStatusIcon({ status }: { status: SaveStatus }) {
  if (status === 'saving') return <CloudUploadIcon fontSize="small" sx={{ color: 'text.disabled' }} />
  if (status === 'saved') return <CloudDoneIcon fontSize="small" sx={{ color: 'success.main' }} />
  if (status === 'error') return <ErrorOutlineIcon fontSize="small" sx={{ color: 'error.main' }} />
  return null
}
