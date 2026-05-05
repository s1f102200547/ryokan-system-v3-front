// src/components/ReservationCardSet1.jsx
import React from 'react';
import { Box } from '@mui/material';
import ReservationNestedEditorList from './ReservationNestedEditorList';
import MailMemo from './MailMemo';

export default function ReservationCardSet1({
  localData,
  nights,
  handleChange,
  handleArrayChange,
  handleLateOut,
}) {
  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 150px)' }}>
      {/* 左：予約詳細エディタ */}
      <Box sx={{
        flex: 2.25,
        overflowY: 'auto',
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '2px' },
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0,0,0,0.2) transparent',
      }}>
        <ReservationNestedEditorList
          localData={localData}
          nights={nights}
          handleChange={handleChange}
          handleArrayChange={handleArrayChange}
          handleLateOut={handleLateOut}
        />
      </Box>

      {/* 右：メールメモ */}
      <Box sx={{ flex: 7.75, position: 'relative', p: 2 }}>
        <MailMemo
          booking_site = {localData.booking_site}
          items={localData.mail_memo || []}
          onChange={updatedItems => handleChange('mail_memo', updatedItems)}
        />
      </Box>
    </Box>
  );
}
