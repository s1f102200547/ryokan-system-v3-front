// src/components/GuestInfoEditable.jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import { updateReservation, createReservation } from '../utils/dbUtils';
import ReservationGrid from './ReservationGrid';
import ReservationDialog from './ReservationDialog';
import ReservationCardSet3 from './ReservationCardSet3';
import { useReservationDataByDate } from '../hooks/useReservationDataByDate';
import { formatDate, computeNights } from '../utils/dateUtils';
import { DINNER_NONE } from '../constants/dinnerTime';
import debounce from 'lodash/debounce';

const generateReservationNumber = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `res-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const GuestInfoEditable = ({ year, month, day }) => {
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [newLocalData, setNewLocalData] = useState(null);
  const [newDirty, setNewDirty] = useState(false);
  const reservationCardRef = useRef(null);
  const pendingPayloadRef = useRef({});

  const hasPendingPayload = () =>
    Object.keys(pendingPayloadRef.current || {}).length > 0;

  // デバウンス付き更新関数
  const debouncedUpdate = useRef(
    debounce(({ reservationId }) => {
      const payload = pendingPayloadRef.current;
      pendingPayloadRef.current = {};
      updateReservation({ reservationId, payload });
    }, 500)
  ).current;

  const flushPendingUpdates = () => {
    if (!hasPendingPayload()) {
      debouncedUpdate.cancel();
      return;
    }
    debouncedUpdate.flush();
  };

  // Firestore から当日の予約データを取得
  const dateString = year && month && day ? `${year}/${month}/${day}` : null;
  const { rows: reservations, loading } = useReservationDataByDate(dateString);

  // 自動更新ハンドラ
  const handleAutoFieldChange = (field, value, idx) => {
    if (!selectedReservation?.id) return;
    const payload = Array.isArray(value)
      ? { [field]: value }
      : { [field]: value };
    pendingPayloadRef.current = {
        ...pendingPayloadRef.current,
        ...payload,
    };
    debouncedUpdate({
      reservationId: selectedReservation.id,
    });
  };

  const handleSelectReservation = (reservation) => {
    flushPendingUpdates();
    setSelectedReservation(reservation);
  };

  const handleCloseReservationDialog = () => {
    flushPendingUpdates();
    setSelectedReservation(null);
  };

  useEffect(() => () => {
    flushPendingUpdates();
  }, [year, month, day]);

  // 既存予約キャンセル
  const handleCancelReservation = async (reservation) => {
    if (!reservation.id || reservation.id === 'new') return;
    const existingLock = reservation.cancel_lock ?? 0;
    const payload = { cancel: 1 };
    if (!existingLock) payload.cancel_lock = 1;
    await updateReservation({ reservationId: reservation.id, payload });
  };

  // 新規予約ダイアログ開く
  const handleAddClick = () => {
    if (!year || !month || !day) return;
    const ci = new Date(year, month - 1, day);
    const co = new Date(ci.getTime() + 86400000);

    setNewLocalData({
      reservation_number: generateReservationNumber(),
      check_in_date:  formatDate(ci),
      check_out_date: formatDate(co),
      guest_name: '',
      room: '',
      adult_count: 0,
      child_count: 0,
      open_air_bath_time: Array(computeNights(formatDate(ci), formatDate(co))).fill(''),
      breakfast_time:     Array(computeNights(formatDate(ci), formatDate(co))).fill(''),
      dinner_time:        Array(computeNights(formatDate(ci), formatDate(co))).fill(DINNER_NONE),
      dinner_info:        Array(computeNights(formatDate(ci), formatDate(co))).fill(''),
      timetable_info:     Array(computeNights(formatDate(ci), formatDate(co))).fill(''),
      communication_note: '',
      a_tax_received: false,
      a_tax_received_by_staff_name: '',
      tax: 0,
    });
    setNewDirty(false);
  };

  // 新規予約入力ハンドラ
  const handleNewChange = (field, value) => {
    setNewLocalData(prev => ({ ...prev, [field]: value }));
    setNewDirty(true);
  };

  // 新規予約作成
  const handleCreate = async () => {
    if (!newLocalData) return;
    const payload = { ...newLocalData, cancel: 0, cancel_lock: 1 };
    await createReservation({ payload });
    setNewLocalData(null);
  };

  // 新規予約の必須入力チェック
  const allFilled = !!newLocalData &&
    newLocalData.check_out_date !== '' &&
    newLocalData.guest_name.trim() !== '' &&
    newLocalData.room.trim() !== '' &&
    (Number(newLocalData.adult_count) > 0 || Number(newLocalData.child_count) > 0);

  if (loading) return <div>Loading...</div>;

  return (
    <>
      <ReservationGrid
        reservations={reservations}
        onSelectReservation={handleSelectReservation}
        onAddReservation={handleAddClick}
        onCancelReservation={handleCancelReservation}
      />

      {/* 新規予約ダイアログ */}
      <Dialog open={Boolean(newLocalData)} onClose={() => setNewLocalData(null)} maxWidth="sm" fullWidth>
        <DialogTitle>新規予約</DialogTitle>
        <DialogContent>
          {newLocalData && (
            <ReservationCardSet3 localData={newLocalData} handleChange={handleNewChange} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewLocalData(null)}>キャンセル</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newDirty || !allFilled}>作成</Button>
        </DialogActions>
      </Dialog>

      {/* 既存予約ダイアログ */}
      <ReservationDialog
        open={Boolean(selectedReservation)}
        reservation={selectedReservation}
        onClose={handleCloseReservationDialog}
        onFieldChange={handleAutoFieldChange}
        reservationCardRef={reservationCardRef}
      />
    </>
  );
};

export default GuestInfoEditable;
