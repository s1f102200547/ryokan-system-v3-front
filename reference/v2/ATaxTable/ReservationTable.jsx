// src/components/ReservationTable.jsx
import React, { useState, useEffect } from 'react';
import { Box, CircularProgress, Checkbox, TextField, Alert } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { parseDate, formatDate } from '../utils/dateUtils';
import {
  updateReservationField,
  updateDateField,
  toggleTaxReceived,
  fetchSafeBalanceChecker
} from '../services/reservationService';

// -------- Editable Cells --------
const ReservationEditableCell = ({ id, field, value, api, row, onError }) => {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);

  const handleBlur = async () => {
    if (text === value) return;
    try {
      await updateReservationField(id, field, text);
      api.updateRows([{ id, [field]: text }]);
    } catch (e) {
      onError?.('予約データ更新エラー: ' + e.message);
    }
  };

  return (
    <TextField
      variant="standard"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={handleBlur}
      fullWidth
      onClick={e => e.stopPropagation()}
    />
  );
};

const DateEditableCell = ({ id, value, api, row, onError }) => {
  const [text, setText] = useState(value || '');
  useEffect(() => setText(value || ''), [value]);

  const handleBlur = async () => {
    if (text === value) return;
    try {
      await updateDateField(row.check_in_date, 'safeBalanceChecker', text);
      api.updateRows([{ id, x: text }]);
    } catch (e) {
      onError?.('日付データ更新エラー: ' + e.message);
    }
  };

  return (
    <TextField
      variant="standard"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={handleBlur}
      fullWidth
      onClick={e => e.stopPropagation()}
    />
  );
};

// -------- Main Table Component --------
const ReservationTable = ({
  rows,
  loading,
  onToggle,
  option,
  enableFilter,
  onProcessedRows   // ★追加
}) => {
  const [rowData, setRowData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const processRows = async () => {
      try {
        const sorted = [...rows].sort(
          (a, b) => parseDate(a.check_in_date) - parseDate(b.check_in_date)
        );

        const dateCount = sorted.reduce((acc, r) => {
          acc[r.check_in_date] = (acc[r.check_in_date] || 0) + 1;
          return acc;
        }, {});

        const dateAdultNightSum = sorted.reduce((acc, r) => {
          const key = r.check_in_date;
          if (r.booking_site?.toLowerCase() === 'chillnn' || r.a_tax_received) {
            acc[key] = (acc[key] || 0) + (r.adult_count * r.nights);
          }
          return acc;
        }, {});

        const uniqueDates = Object.keys(dateCount);

        const dateValues = {};
        await Promise.all(
          uniqueDates.map(async dateStr => {
            dateValues[dateStr] = await fetchSafeBalanceChecker(dateStr);
          })
        );

        const enhanced = [];
        uniqueDates.forEach(dateStr => {
          let seen = 0;
          const count = dateCount[dateStr];
          sorted.forEach(r => {
            if (r.check_in_date === dateStr) {
              seen++;
              enhanced.push({
                ...r,
                isLastDate: seen === count,
                x: seen === count ? dateValues[dateStr] : '',
                adultNightSum: seen === count ? (dateAdultNightSum[dateStr] || 0) : null
              });
            }
          });
        });

        // --- 先月 or 今月フィルタOFF → 全行表示 ---
        if (option === 'previous' || (option === 'current' && !enableFilter)) {
          setRowData(enhanced);
          onProcessedRows?.(enhanced);   // ★追加
          return;
        }

        // --- 今月フィルタON ---
        const firstUnrec = sorted.find(
          r => r.booking_site?.toLowerCase() !== 'chillnn' && !r.a_tax_received
        );

        const startDateStr = firstUnrec?.check_in_date || formatDate(new Date());
        let startDate = parseDate(startDateStr);

        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (startDate > todayMidnight) {
          startDate = todayMidnight;
        }

        const today = new Date();

        const filtered = enhanced.filter(r => {
          const d = parseDate(r.check_in_date);
          return d >= startDate && d <= today;
        });

        setRowData(filtered);
        onProcessedRows?.(filtered);  // ★追加

      } catch (e) {
        console.error('データ処理エラー:', e);
        setError('データ処理中にエラーが発生しました: ' + e.message);
      }
    };

    processRows();
  }, [rows, option, enableFilter]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  const handleTaxToggle = ({ id, row, value }) => {
    const checked = !value;
    onToggle(id, checked);
    toggleTaxReceived(id, checked)
      .catch(e => setError('受領状態更新エラー: ' + e.message));
  };

  const columns = [
    {
      field: 'a_tax_received',
      headerName: '受領済み',
      flex: 1,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: p =>
        p.row.booking_site?.toLowerCase() === 'chillnn' ? null : (
          <Checkbox checked={!!p.value} onChange={() => handleTaxToggle(p)} />
        )
    },
    { field: 'check_in_date', headerName: 'C/I日', flex: 1.5 },
    { field: 'room', headerName: '部屋', flex: 1 },
    { field: 'guest_name', headerName: 'ゲスト名', flex: 2 },
    { field: 'adult_count', headerName: '大人人数', flex: 1 },
    { field: 'nights', headerName: '泊数', flex: 1 },
    { field: 'booking_site', headerName: '予約サイト', flex: 2 },
    { field: 'tax', headerName: '宿泊税', flex: 1 },
    {
      field: 'a_tax_received_by_staff_name',
      headerName: '受領スタッフ名',
      flex: 2,
      renderCell: p =>
        p.row.booking_site?.toLowerCase() === 'chillnn' ? null : (
          <ReservationEditableCell {...p} field="a_tax_received_by_staff_name" onError={setError} />
        )
    },
    {
      field: 'x',
      headerName: '締めスタッフ名',
      flex: 2,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: p => (p.row.isLastDate ? <DateEditableCell {...p} onError={setError} /> : null)
    },
    {
      field: 'adultNightSum',
      headerName: '大人人数×泊数',
      flex: 1.5,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: p => (p.row.isLastDate ? p.value ?? 0 : null)
    }
  ];

  return (
    <Box sx={{ height: 600, width: '100%', overflowX: 'hidden' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <DataGrid
        rows={rowData}
        columns={columns}
        loading={loading}
        disableSelectionOnClick
        disableColumnMenu
        hideSortIcons
        sortingMode="none"
        initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
        pageSizeOptions={[100]}
      />
    </Box>
  );
};

export default ReservationTable;
