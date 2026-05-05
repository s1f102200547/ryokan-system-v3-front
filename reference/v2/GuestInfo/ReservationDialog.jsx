// src/components/ReservationDialog.js
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Tabs,
  Tab,
  Box
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import ReservationCard from './ReservationCard';
import { computeNights } from '../utils/dateUtils';

export default function ReservationDialog({
  open,
  reservation,
  onClose,
  onFieldChange,
  reservationCardRef
}) {
  const [currentTab, setCurrentTab] = useState(0);
  useEffect(() => {
    if (!open || !reservation?.check_in_date) return;
    setCurrentTab(0);
  }, [open, reservation?.check_in_date]);

  const nights = reservation
    ? computeNights(reservation.check_in_date, reservation.check_out_date)
    : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={currentTab === 0 ? 'lg' : 'md'}
      fullWidth={currentTab === 0}
      PaperProps={{
        sx: {
          height: '600px',        // ダイアログ高さを固定
          display: 'flex',
          flexDirection: 'column',
          width: currentTab === 0 ? undefined : 'auto',
          minWidth: currentTab === 0 ? undefined : 360,
          transition: theme =>
            theme.transitions.create(
              ['width', 'max-width', 'min-width'],
              { duration: theme.transitions.duration.shorter }
            ),
        }
      }}
    >
      {/* ヘッダー */}
      <DialogTitle
        sx={{
          p: 0,
          minHeight: 40,
          overflow: 'visible'
        }}
      >
        <Box
          sx={{
            // 3カラムGrid（左右1fr / 中央auto）で中央タブを厳密センター
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            // 高さをきっちり締める
            height: 40,
            boxSizing: 'border-box',
            px: 1,
            py: 0
          }}
        >
          {/* 左：部屋番号＋氏名 */}
          <Box sx={{ gridColumn: 1, justifySelf: 'start', minWidth: 0 }}>
            {reservation && (
              <Typography
                variant="subtitle2"
                sx={{ fontSize: '0.75rem', lineHeight: 1 }}
                noWrap
              >
                {reservation.room} ／ {reservation.guest_name}
              </Typography>
            )}
          </Box>

          {/* 中央：タブ（厳密センター・薄型） */}
          <Box sx={{ gridColumn: 2, justifySelf: 'center' }}>
            <Tabs
              value={currentTab}
              onChange={(_, v) => setCurrentTab(v)}
              indicatorColor="primary"
              textColor="primary"
              variant="standard"
              sx={{
                minHeight: 28,                 // Tabs本体の高さを縮める
                '& .MuiTabs-flexContainer': { alignItems: 'center' },
                '& .MuiTabs-indicator': { height: 2 }, // インジケータも薄く
              }}
            >
              {['C/I前', 'C/I後'].map((label, idx) => (
                <Tab
                  key={idx}
                  label={label}
                  disableRipple
                  sx={{
                    fontSize: '0.75rem',
                    minHeight: 28,            // Tabの最小高さも合わせる
                    padding: '0 6px',         // 余白を詰める
                    lineHeight: 1.2,
                    '&.Mui-selected': {
                      fontWeight: 'bold'
                    },
                    '&:not(.Mui-selected)': {
                      color: 'text.secondary',
                      transition: 'background-color 0.2s ease, color 0.2s ease',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.08)',
                        color: 'text.primary',
                        cursor: 'pointer'
                      }
                    }
                  }}
                />
              ))}
            </Tabs>
          </Box>

          {/* 右：閉じるボタン（小さめで高さに影響しない） */}
          <IconButton
            aria-label="close"
            onClick={onClose}
            size="small"
            sx={{
              gridColumn: 3,
              justifySelf: 'end',
              alignSelf: 'center',
              position: 'relative',
              p: 3,                 // さらにタップ領域を拡張
              m: -2,                // レイアウトを崩さないよう補正
              fontSize: 28,         // アイコンの視認性は確保しつつ控えめ
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
              },
            }}
          >
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {reservation && (
          <ReservationCard
            ref={reservationCardRef}
            reservation={reservation}
            nights={nights}
            currentTab={currentTab}
            onFieldChange={onFieldChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
