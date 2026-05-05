import React from 'react';
import { Grid } from '@mui/material';
import ReservationListCard from './ReservationListCard';
import AddReservationCard from './AddReservationCard'; // 既に追加カードを用意している想定

const ReservationGrid = ({
  reservations,
  onSelectReservation,
  onAddReservation,
  onCancelReservation,
}) => (
  <Grid container spacing={2} justifyContent="center">
    {reservations.map(reservation => (
      <Grid key={reservation.id}>
        <ReservationListCard
          reservation={reservation}
          onClick={onSelectReservation}
          onCancel={onCancelReservation}
        />
      </Grid>
    ))}

    {/* 追加用「＋」カード */}
    <Grid key="add">
      <AddReservationCard onClick={onAddReservation} />
    </Grid>
  </Grid>
);

export default ReservationGrid;
