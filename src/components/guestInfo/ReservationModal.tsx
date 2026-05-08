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
import { resizeNightFields, resizeNightArray } from '@/domain/reservation/nightArrays'
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

  const localDataRef = useRef<Reservation>(localData)
  useEffect(() => { localDataRef.current = localData })

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
      const current = localDataRef.current
      let patch: ReservationPatch = { [field]: value }

      if (field === 'check_out_date' && typeof value === 'string') {
        const newNights = dateDiff(current.check_in_date, value)
        if (newNights > 0) {
          const resized = resizeNightFields(
            {
              dinner_time: current.dinner_time,
              dinner_info: current.dinner_info,
              breakfast_time: current.breakfast_time,
              open_air_bath_time: current.open_air_bath_time,
              timetable_info: current.timetable_info,
            },
            newNights,
          )
          patch = { ...patch, ...resized }
        }
      }

      if (field === 'adult_count' && typeof value === 'number') {
        patch = { ...patch, age_groups: resizeNightArray<string | null>(current.age_groups, value, null) }
      }

      pendingPayloadRef.current = { ...pendingPayloadRef.current, ...patch }
      setLocalData((prev) => ({ ...prev, ...patch }))
      debouncedUpdateRef.current?.(current.id)
    },
    [],
  )

  const nights = dateDiff(localData.check_in_date, localData.check_out_date)

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      maxWidth={tab === 0 ? 'md' : 'sm'}
      fullWidth
      slotProps={{
        paper: {
          sx: (theme) => ({
            height: 600,
            display: 'flex',
            flexDirection: 'column',
            transition: theme.transitions.create(['max-width', 'width'], {
              duration: theme.transitions.duration.shorter,
              easing: theme.transitions.easing.easeInOut,
            }),
          }),
        },
      }}
    >
      <DialogTitle
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          py: 1,
          px: 2,
          minHeight: 44,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
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

        {/* 右: 保存ステータス */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', pr: 4 }}>
          <SaveStatusIcon status={saveStatus} />
        </Box>
        <IconButton
          onClick={handleClose}
          aria-label="閉じる"
          sx={{
            position: 'absolute',
            top: -20,
            right: -15,
            width: 85,
            height: 85,
            p: 1.75,
            zIndex: 2,
          }}
        >
          <CloseIcon sx={{ fontSize: 28 }} />
        </IconButton>
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
  if (status === 'saving') return <CloudUploadIcon fontSize="small" sx={{ color: 'text.disabled' }} data-testid="save-status" data-status="saving" />
  if (status === 'saved') return <CloudDoneIcon fontSize="small" sx={{ color: 'success.main' }} data-testid="save-status" data-status="saved" />
  if (status === 'error') return <ErrorOutlineIcon fontSize="small" sx={{ color: 'error.main' }} data-testid="save-status" data-status="error" />
  return null
}
