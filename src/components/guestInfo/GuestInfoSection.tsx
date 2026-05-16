'use client'

import type { ReactNode } from 'react'
import { useState, useCallback, useLayoutEffect, useRef } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import { useGuestInfo } from '@/hooks/guestInfo/useGuestInfo'
import { ReservationListCard } from './ReservationListCard'
import { AddReservationCard } from './AddReservationCard'
import { ReservationModal } from './ReservationModal'
import { CancelDialog } from './CancelDialog'
import { AddReservationDialog } from './AddReservationDialog'
import { CancelledSection } from './CancelledSection'
import type { Reservation } from '@/types/reservation'
import type { GuestInfoToggle } from '@/types/guestInfo'
import { dateDiff } from '@/lib/dateUtils'

type Props = {
  selectedDate: string
  topContent?: ReactNode
  sideContent?: ReactNode
  selectedToggle?: GuestInfoToggle | null
}

type DisplayEntry = { reservation: Reservation; isStaying: boolean }
type SortKey = {
  group: number
  minutes: number
  suffixOrder: number
  value: string
}

function sortActiveByRoom(entries: DisplayEntry[]): DisplayEntry[] {
  return [...entries].sort((a, b) => {
    const ra = a.reservation.room ?? '9999'
    const rb = b.reservation.room ?? '9999'
    return ra.localeCompare(rb, undefined, { numeric: true })
  })
}

function compareRoom(a: Reservation, b: Reservation): number {
  const ra = a.room ?? '9999'
  const rb = b.room ?? '9999'
  return ra.localeCompare(rb, undefined, { numeric: true })
}

function parseTimeValue(value: string | null | undefined): Omit<SortKey, 'group'> | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})([ab])?$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return {
    minutes: hours * 60 + minutes,
    suffixOrder: match[3] === 'b' ? 1 : 0,
    value,
  }
}

function timeKey(value: string | null | undefined): SortKey {
  const parsed = parseTimeValue(value)
  if (parsed) return { group: 0, ...parsed }
  return { group: 2, minutes: Number.POSITIVE_INFINITY, suffixOrder: 0, value: '' }
}

function sortKeyForToggle(
  entry: DisplayEntry,
  toggle: GuestInfoToggle | null | undefined,
  targetDate: string,
): SortKey {
  const { reservation } = entry
  const idx = dateDiff(reservation.check_in_date, targetDate)

  switch (toggle) {
    case 'checkIn':
      if (reservation.check_in_date !== targetDate) return timeKey(null)
      if (reservation.arrival_time === null) {
        return { group: 1, minutes: Number.POSITIVE_INFINITY, suffixOrder: 0, value: '未定' }
      }
      return timeKey(reservation.arrival_time)
    case 'openAirBath':
      return timeKey(reservation.open_air_bath_time[idx])
    case 'dinner': {
      const value = reservation.dinner_time[idx]
      if (value === 'PENDING') {
        return { group: 1, minutes: Number.POSITIVE_INFINITY, suffixOrder: 0, value: '未定' }
      }
      if (!value || value === 'NONE' || value === 'CANCEL') return timeKey(null)
      return timeKey(value)
    }
    case 'breakfast':
      return timeKey(reservation.breakfast_time[idx])
    default:
      return timeKey(null)
  }
}

function sortActive(entries: DisplayEntry[], toggle: GuestInfoToggle | null | undefined, targetDate: string): DisplayEntry[] {
  if (!toggle) return sortActiveByRoom(entries)

  return [...entries].sort((a, b) => {
    const ak = sortKeyForToggle(a, toggle, targetDate)
    const bk = sortKeyForToggle(b, toggle, targetDate)
    if (ak.group !== bk.group) return ak.group - bk.group
    if (ak.minutes !== bk.minutes) return ak.minutes - bk.minutes
    if (ak.suffixOrder !== bk.suffixOrder) return ak.suffixOrder - bk.suffixOrder
    if (ak.value !== bk.value) return ak.value.localeCompare(bk.value, undefined, { numeric: true })
    return compareRoom(a.reservation, b.reservation)
  })
}

function sortByRoom(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort((a, b) => {
    return compareRoom(a, b)
  })
}

export function GuestInfoSection({ selectedDate, topContent, sideContent, selectedToggle }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalReservation, setModalReservation] = useState<Reservation | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null)
  const cardElementsRef = useRef(new Map<string, HTMLDivElement>())
  const previousCardRectsRef = useRef(new Map<string, DOMRect>())
  const previousAnimatedLoadedDateRef = useRef<string | null>(null)

  const { data, isLoading, error, loadedDate } = useGuestInfo(selectedDate, refreshKey)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handleCancelled = useCallback(() => {
    setCancelTarget(null)
    refresh()
    setSnackbarMessage('キャンセルしました')
  }, [refresh])

  const handleAdded = useCallback(() => {
    refresh()
    setSnackbarMessage('予約を追加しました')
  }, [refresh])

  const shouldShowStayingCards =
    selectedToggle === 'openAirBath' || selectedToggle === 'dinner' || selectedToggle === 'breakfast'
  const displayDate = loadedDate ?? selectedDate
  const allActive = sortActive([
    ...(data?.normal ?? []).map((r) => ({ reservation: r, isStaying: false })),
    ...(shouldShowStayingCards
      ? (data?.staying ?? []).map((r) => ({ reservation: r, isStaying: true }))
      : []),
  ], selectedToggle, displayDate)
  const cancelled = sortByRoom(data?.cancelled ?? [])
  const isShowingStaleData = isLoading && data !== null && loadedDate !== selectedDate

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>()
    const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isLoadedDateChanged =
      loadedDate !== null && previousAnimatedLoadedDateRef.current !== loadedDate

    for (const { reservation } of allActive) {
      const node = cardElementsRef.current.get(reservation.id)
      if (!node) continue

      const nextRect = node.getBoundingClientRect()
      const previousRect = previousCardRectsRef.current.get(reservation.id)
      nextRects.set(reservation.id, nextRect)

      if (shouldReduceMotion) continue

      node.getAnimations().forEach((animation) => animation.cancel())

      if (isLoadedDateChanged) {
        node.animate(
          [
            { opacity: 0.35, transform: 'translateY(-4px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: 220,
            easing: 'ease-out',
          },
        )
        continue
      }

      if (!previousRect) continue

      const deltaX = previousRect.left - nextRect.left
      const deltaY = previousRect.top - nextRect.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue

      node.animate(
        [
          { opacity: 0.35, transform: `translate(${deltaX}px, ${deltaY}px)` },
          { opacity: 1, transform: 'translate(0, 0)' },
        ],
        {
          duration: 220,
          easing: 'ease-out',
        },
      )
    }

    previousCardRectsRef.current = nextRects
    if (loadedDate !== null) {
      previousAnimatedLoadedDateRef.current = loadedDate
    }
  }, [allActive, loadedDate])

  // data === null は初回ロードのみ。refresh 中は data が残るので UI を保持し Snackbar を消さない
  if (isLoading && data === null) {
    return (
      <Box sx={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!isLoading && error) {
    return <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
  }

  return (
    <Box>
      <Box
        key={loadedDate ?? 'guest-info-empty'}
        sx={{
          opacity: isShowingStaleData ? 0.35 : 1,
          transition: 'opacity 120ms ease-out',
        }}
      >
        {topContent}

        {/* アクティブな予約カード列（当日CI + 滞在中） */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0, justifyContent: 'center', mt: topContent ? 3 : 10 }}>
          {allActive.map(({ reservation, isStaying }) => (
            <Box
              key={reservation.id}
              ref={(node: HTMLDivElement | null) => {
                if (node) cardElementsRef.current.set(reservation.id, node)
                else cardElementsRef.current.delete(reservation.id)
              }}
              sx={{ display: 'inline-flex' }}
            >
              <ReservationListCard
                reservation={reservation}
                onClick={setModalReservation}
                onCancelOrRestore={setCancelTarget}
                isStaying={isStaying}
                selectedToggle={selectedToggle}
                targetDate={displayDate}
              />
            </Box>
          ))}
          <AddReservationCard onClick={() => setAddDialogOpen(true)} />
        </Box>

        {(cancelled.length > 0 || sideContent) && (
          <Box
            sx={{
              mt: 3,
              width: '70%',
              mx: 'auto',
            }}
          >
            {cancelled.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                キャンセル済み
              </Typography>
            )}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 3,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ minWidth: '240px', visibility: cancelled.length > 0 ? 'visible' : 'hidden' }}>
                {cancelled.length > 0 && (
                  <CancelledSection
                    reservations={cancelled}
                    onCardClick={setModalReservation}
                    onRestore={() => undefined}
                    showRestoreAction={false}
                    hideTitle
                  />
                )}
              </Box>
              {sideContent}
            </Box>
          </Box>
        )}
      </Box>

      {/* モーダル / ダイアログ */}
      <ReservationModal
        reservation={modalReservation}
        onClose={() => { setModalReservation(null); refresh() }}
      />

      <CancelDialog
        reservation={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={handleCancelled}
      />

      <AddReservationDialog
        open={addDialogOpen}
        checkInDate={selectedDate}
        onClose={() => setAddDialogOpen(false)}
        onAdded={handleAdded}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Box>
  )
}
