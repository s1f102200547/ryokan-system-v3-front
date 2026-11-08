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
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined'
import { debounce } from '@/lib/debounce'
import { dateDiff } from '@/lib/dateUtils'
import { rememberArrayFields, resizeNightFields, resizeNightArray } from '@/domain/reservation/nightArrays'
import type { ArrayFieldMemory } from '@/domain/reservation/nightArrays'
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
  // 泊数・大人の人数を縮めても、伸ばし直したときに入力を戻すための記憶
  const arrayMemoryRef = useRef<ArrayFieldMemory>({
    dinner_time: reservation.dinner_time,
    dinner_info: reservation.dinner_info,
    breakfast_time: reservation.breakfast_time,
    open_air_bath_time: reservation.open_air_bath_time,
    timetable_info: reservation.timetable_info,
    age_groups: reservation.age_groups,
  })
  const { execute, saveStatus, error, clearError } = useUpdateReservation()
  const debouncedUpdateRef = useRef<DebouncedFn | null>(null)

  // 進行中の保存。保存は1件ずつ、前の保存が終わってから送る（応答の順序が入れ替わらないように）
  const savingRef = useRef<Promise<void>>(Promise.resolve())
  // 4xx で断られ、まだ保存できていないフィールド。送り直しはしないが、閉じると失われるので閉じるときに確認する。
  // 同じフィールドをあとで保存できたら外す
  const rejectedFieldsRef = useRef<Set<keyof ReservationPatch>>(new Set())

  // 保留中の変更を送る。通信エラー・サーバーの障害で失敗した変更は保留に戻し、
  // 次の入力か「閉じる」で送り直す。以前は失敗した変更を捨てていたため、画面には入力が残るのに保存されていなかった。
  // 入力の誤り（400）などは送り直しても通らないので捨てる（画面には理由が出ている）
  const save = useCallback((id: string): Promise<void> => {
    savingRef.current = savingRef.current.then(async () => {
      const payload = pendingPayloadRef.current
      if (Object.keys(payload).length === 0) return
      pendingPayloadRef.current = {}
      const result = await execute(id, payload)
      const fields = Object.keys(payload) as (keyof ReservationPatch)[]
      if (result === 'retry') {
        // 待っている間に入力された新しい値を優先する
        pendingPayloadRef.current = { ...payload, ...pendingPayloadRef.current }
      } else if (result === 'rejected') {
        for (const f of fields) rejectedFieldsRef.current.add(f)
      } else {
        for (const f of fields) rejectedFieldsRef.current.delete(f)
      }
    })
    return savingRef.current
  }, [execute])

  useEffect(() => {
    const fn = debounce((id: string) => { void save(id) }, SAVE_DEBOUNCE_MS)
    debouncedUpdateRef.current = fn
    return () => fn.cancel()
  }, [save])

  // 保留中の変更（失敗した変更を含む）を送り、進行中の保存も終わってから閉じる。
  // 保存の完了前に閉じると、一覧の再取得が保存より先に走る。
  // 送り直しても失敗した変更、または入力の誤りで断られた変更が残っていれば、閉じる前に確認する（確認は1回）。
  // 以前は断られた変更を黙って捨てて閉じ、理由もモーダルと一緒に消えていた
  const handleClose = useCallback(async () => {
    debouncedUpdateRef.current?.cancel()
    await save(reservation.id)
    const message =
      Object.keys(pendingPayloadRef.current).length > 0
        ? '保存できていない変更があります。閉じると失われます。閉じますか？'
        : rejectedFieldsRef.current.size > 0
          ? '保存できなかった変更があります（入力内容の誤り）。閉じると失われます。閉じますか？'
          : null
    if (message !== null && !window.confirm(message)) return
    onClose()
  }, [save, onClose, reservation.id])

  // Step 54: onBlur on any input field immediately flushes pending debounced save
  const handleBlurFlush = useCallback(() => {
    debouncedUpdateRef.current?.flush()
  }, [])

  const handleFieldChange = useCallback(
    (field: keyof ReservationPatch, value: unknown) => {
      const current = localDataRef.current
      const memory = arrayMemoryRef.current
      let patch: ReservationPatch = { [field]: value }

      // 今の配列ではなく記憶から伸び縮みさせる。途中で縮めた分も、伸ばし直せば戻る
      if (field === 'check_out_date' && typeof value === 'string') {
        const newNights = dateDiff(current.check_in_date, value)
        if (newNights > 0) {
          patch = { ...patch, ...resizeNightFields(memory, newNights) }
        }
      }

      if (field === 'adult_count' && typeof value === 'number') {
        patch = { ...patch, age_groups: resizeNightArray<string | null>(memory.age_groups, value, null) }
      }

      arrayMemoryRef.current = rememberArrayFields(memory, patch)

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
  if (status === 'error') return <ErrorOutlineOutlinedIcon fontSize="small" sx={{ color: 'error.main' }} data-testid="save-status" data-status="error" />
  return null
}
