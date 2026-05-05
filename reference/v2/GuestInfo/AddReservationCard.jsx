// src/components/AddReservationCard.jsx
import React from 'react';
import { Card, IconButton, Box } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

export default function AddReservationCard({ onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={{
        width: 120,
        height: 120,
        m: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.paper',
        transition: 'background-color 0.2s',
        '&:hover': { bgcolor: 'grey.100' },
        '&:active': { bgcolor: 'grey.200' },
      }}
    >
      <Box>
        <IconButton
          onClick={onClick}
          size="large"
          sx={{ p: 0 }}
        >
          <AddCircleOutlineIcon fontSize="large" />
        </IconButton>
      </Box>
    </Card>
  );
}
