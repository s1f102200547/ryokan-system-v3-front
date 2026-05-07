'use client'

import Box from '@mui/material/Box'
import { ReservationEditorList } from './ReservationEditorList'
import { MailMemo } from './MailMemo'
import type { Reservation } from '@/types/reservation'
import type { ReservationPatch } from '@/types/guestInfo'

type Props = {
  localData: Reservation
  nights: number
  onFieldChange: (field: keyof ReservationPatch, value: unknown) => void
  onBlurFlush: () => void
}

export function ReservationCardSet1({ localData, nights, onFieldChange, onBlurFlush }: Props) {
  return (
    <Box sx={{ display: 'flex', gap: 2, height: '100%' }}>
      {/* 左: フィールド編集（20%幅） */}
      <Box
        onBlur={onBlurFlush}
        sx={{
          flex: '0 0 20%',
          m: 2,
          mr: 0,
          pr: 1.25,
          borderRight: '1px solid',
          borderColor: 'divider',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(0,0,0,0.2) transparent',
          '&::-webkit-scrollbar': { width: '4px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '2px' },
        }}
      >
        <ReservationEditorList
          localData={localData}
          nights={nights}
          onFieldChange={onFieldChange}
        />
      </Box>

      {/* 右: メールメモ */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pt: 4, pb: 2 }}>
        <MailMemo
          bookingSite={localData.booking_site}
          items={localData.mail_memo}
          onChange={(items) => onFieldChange('mail_memo', items)}
        />
      </Box>
    </Box>
  )
}
