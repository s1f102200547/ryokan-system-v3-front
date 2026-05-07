'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
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

// Outer shell: guard null and provide key= to reset all inner state when reservation changes
export function ReservationModal({ reservation, onClose }: Props) {
  if (!reservation) return null
  return <ModalBody key={reservation.id} reservation={reservation} onClose={onClose} />
}

const SAVE_DEBOUNCE_MS = 500

type DebouncedFn = ((id: string) => void) & { flush: () => void; cancel: () => void }

function ModalBody({ reservation, onClose }: { reservation: Reservation; onClose: () => void }) {
  const [tab, setTab] = useState(0)
  // Initialize from prop; key= resets this when reservation changes, so no effect needed
  const [localData, setLocalData] = useState<Reservation>(reservation)

  const pendingPayloadRef = useRef<ReservationPatch>({})
  const { execute, saveStatus, error, clearError } = useUpdateReservation()

  // Initialize debounce in effect to avoid refs-in-render lint error
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

  const handleFieldChange = useCallback(
    (field: keyof ReservationPatch, value: unknown) => {
      let patch: ReservationPatch = { [field]: value }

      // check_out_date 変更時は夜数連動フィールドもリサイズ
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
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 0.5, px: 2, minHeight: 32 }}>
        {/* 左: 部屋 / ゲスト名 */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {localData.room ?? '部屋未定'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {localData.guest_name || '（名前未記入）'}
          </Typography>
        </Box>

        {/* 中央: タブ */}
        <Tabs
          value={tab}
          onChange={(_, v: number) => setTab(v)}
          sx={{ mx: 'auto' }}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab
            label="C/I前"
            sx={{
              minHeight: 32,
              py: 0.25,
              '&:hover': { bgcolor: 'action.hover', borderRadius: 1 },
            }}
          />
          <Tab
            label="C/I後"
            sx={{
              minHeight: 32,
              py: 0.25,
              '&:hover': { bgcolor: 'action.hover', borderRadius: 1 },
            }}
          />
        </Tabs>

        {/* 右: 保存ステータス + 閉じるボタン */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <SaveStatusIcon status={saveStatus} />
          <IconButton
            onClick={handleClose}
            aria-label="閉じる"
            sx={{ p: 1.5 }}
          >
            <CloseIcon />
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
            />
          )}
          {tab === 1 && (
            <ReservationCardSet2
              localData={localData}
              onFieldChange={handleFieldChange}
            />
          )}
        </Box>
      </DialogContent>

      {/* 保存エラー Snackbar */}
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
