'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CancelIcon from '@mui/icons-material/Cancel'
import UpgradeIcon from '@mui/icons-material/Upgrade'
import type { Reservation } from '@/types/reservation'
import type { GuestInfoToggle } from '@/types/guestInfo'
import { dateDiff } from '@/lib/dateUtils'

type Props = {
  reservation: Reservation
  onClick: (r: Reservation) => void
  onCancelOrRestore: (r: Reservation) => void
  isCancelled?: boolean
  showRestoreAction?: boolean
  isStaying?: boolean
  selectedToggle?: GuestInfoToggle | null
  targetDate?: string
}

function getToggleValue(
  r: Reservation,
  toggle: GuestInfoToggle | null | undefined,
  targetDate: string | undefined,
): string | null {
  if (!toggle || !targetDate) return null
  const idx = dateDiff(r.check_in_date, targetDate)
  switch (toggle) {
    case 'openAirBath': {
      const v = r.open_air_bath_time[idx]
      return v ?? null
    }
    case 'dinner': {
      const v = r.dinner_time[idx]
      if (!v || v === 'NONE' || v === 'CANCEL') return null
      return v === 'PENDING' ? '未定' : v
    }
    case 'checkIn':
      if (r.check_in_date !== targetDate) return null
      return r.arrival_time ?? '未定'
    case 'breakfast': {
      const v = r.breakfast_time[idx]
      return v ?? null
    }
  }
}

export function ReservationListCard({
  reservation,
  onClick,
  onCancelOrRestore,
  isCancelled = false,
  showRestoreAction = true,
  isStaying = false,
  selectedToggle,
  targetDate,
}: Props) {
  const [isActionHovered, setIsActionHovered] = useState(false)

  if (isCancelled) {
    return (
      <Card
        onClick={() => onClick(reservation)}
        data-testid="reservation-card"
        sx={{
          position: 'relative',
          width: 60,
          height: 60,
          m: 0.5,
          cursor: 'pointer',
          bgcolor: 'grey.100',
          opacity: 0.7,
          transition: 'background-color 0.2s',
          '&:hover': { bgcolor: isActionHovered ? 'grey.100' : 'grey.200' },
          '&:active': { bgcolor: 'grey.300' },
        }}
      >
        {showRestoreAction && (
          <Tooltip title="キャンセル復帰する" placement="top">
            <IconButton
              size="small"
              data-testid="restore-button"
              onMouseEnter={() => setIsActionHovered(true)}
              onMouseLeave={() => setIsActionHovered(false)}
              onClick={(e) => {
                e.stopPropagation()
                onCancelOrRestore(reservation)
              }}
              sx={{ position: 'absolute', top: -6, right: -6, p: 0.25 }}
            >
              <UpgradeIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
        <CardContent sx={{ textAlign: 'center', p: '4px !important' }}>
          <Typography variant="caption" noWrap sx={{ display: 'block', fontSize: '0.6rem' }}>
            {reservation.guest_name || '（名前なし）'}
          </Typography>
        </CardContent>
      </Card>
    )
  }

  const infoValue = getToggleValue(reservation, selectedToggle, targetDate)

  const card = (
    <Card
      onClick={isStaying ? undefined : () => onClick(reservation)}
      aria-disabled={isStaying}
      data-testid="reservation-card"
      sx={{
        position: 'relative',
        width: 120,
        height: 120,
        m: 1,
        cursor: isStaying ? 'not-allowed' : 'pointer',
        bgcolor: isStaying ? 'grey.100' : 'background.paper',
        border: isStaying ? '1px dashed' : '1px solid transparent',
        borderColor: isStaying ? 'grey.300' : 'transparent',
        boxShadow: isStaying ? 'none' : 1,
        opacity: isStaying ? 0.72 : 1,
        transition: 'background-color 0.2s, box-shadow 0.2s, opacity 0.2s',
        '&:hover': {
          bgcolor: isStaying ? 'grey.100' : (isActionHovered ? 'background.paper' : 'grey.100'),
          boxShadow: isStaying ? 'none' : 2,
        },
        '&:active': { bgcolor: isStaying ? 'grey.100' : 'grey.200' },
      }}
    >
      {!isStaying && (
        <Tooltip title="キャンセルする" placement="top">
          <IconButton
            size="small"
            data-testid="cancel-button"
            onMouseEnter={() => setIsActionHovered(true)}
            onMouseLeave={() => setIsActionHovered(false)}
            onClick={(e) => {
              e.stopPropagation()
              onCancelOrRestore(reservation)
            }}
            sx={{ position: 'absolute', top: -5, right: -5, minWidth: 'auto' }}
          >
            <CancelIcon sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      )}
      <CardContent sx={{ textAlign: 'center', p: 1, pb: '8px !important' }}>
        <Box sx={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.35 }}>
          <Typography variant="h5" color={isStaying ? 'text.secondary' : 'text.primary'}>
            {reservation.room ?? '—'}
          </Typography>
          <Typography
            variant="caption"
            color={isStaying ? 'text.secondary' : 'text.primary'}
            sx={{ fontSize: '0.55rem', fontWeight: "bold", lineHeight: 1 }}
          >
            {isStaying ? '連泊' : 'C/I'}
          </Typography>
        </Box>
        <Typography variant="body2" noWrap color={isStaying ? 'text.secondary' : 'text.primary'}>
          {reservation.guest_name || '（名前なし）'}
        </Typography>
        <Typography
          variant="caption"
          noWrap
          sx={{
            display: 'block',
            mt: 0.5,
            color: infoValue ? 'primary.main' : 'transparent',
            fontSize: '0.72rem',
            fontWeight: 500,
          }}
        >
          {infoValue ?? '—'}
        </Typography>
      </CardContent>
    </Card>
  )

  if (isStaying) {
    return (
      <Tooltip title="連泊中予約は編集できません" placement="top">
        <Box component="span" sx={{ display: 'inline-flex' }}>
          {card}
        </Box>
      </Tooltip>
    )
  }

  return card
}
