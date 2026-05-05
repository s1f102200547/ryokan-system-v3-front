import React from 'react';
import { Card, CardContent, Typography, IconButton } from '@mui/material';
import { Cancel as CancelIcon } from '@mui/icons-material';

const ReservationListCard = ({ reservation, onClick, onCancel }) => (
  <Card
    onClick={() => onClick(reservation)}
    sx={{
      position: 'relative',
      width: 120,
      height: 120,
      m: 1,
      cursor: 'pointer',
      bgcolor: 'background.paper',
      transition: 'background-color 0.2s',
      '&:hover': { bgcolor: 'grey.100' },
      '&:active': { bgcolor: 'grey.200' },
    }}
  >
    {/* 右上のキャンセルボタン */}
    <IconButton
      size="small"
      onClick={e => {
        e.stopPropagation();
        if (window.confirm('本当にキャンセルしますか？')) {
          onCancel(reservation);
        }
      }}
      sx={{
        position: 'absolute',
        top: -5,
        right: -5,
        minWidth: 'auto',
      }}
    >
      <CancelIcon sx={{ fontSize: 13 }} />
    </IconButton>

    <CardContent sx={{ textAlign: 'center', p: 1 }}>
      <Typography variant="h5">{reservation.room}</Typography>
      <Typography variant="body2">{reservation.guest_name}</Typography>
    </CardContent>
  </Card>
);

export default ReservationListCard;
