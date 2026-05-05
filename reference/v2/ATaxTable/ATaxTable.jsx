// src/components/ATaxTable.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, FormControlLabel, Switch, Button } from '@mui/material';
import MonthSelector from './MonthSelector';
import ReservationTable from './ReservationTable';
import { useMonthlyTarget } from '../hooks/useMonthlyTarget';
import { useReservationDataByMonth } from '../hooks/useReservationDataByMonth';
import { BalanceDisplay } from './BalanceDisplay';
import { convertToCSV, downloadCSV } from '../GuestInfoEditable/utils/csvUtils';

const ATaxTable = () => {
  const [selectedOption, setSelectedOption] = useState('current');
  const [enableFilter, setEnableFilter] = useState(true);
  const [processedRows, setProcessedRows] = useState([]);

  const { targetYear, targetMonth, previousLabel, currentLabel } =
    useMonthlyTarget(selectedOption);

  const { rows, loading } = useReservationDataByMonth(targetYear, targetMonth);
  const [localRows, setLocalRows] = useState([]);

  const startingBalance = 0;

  useEffect(() => {
    setLocalRows(rows);
    setEnableFilter(true);
  }, [rows, selectedOption]);

  const totalReceived = useMemo(
    () => localRows.reduce((sum, r) => sum + (r.a_tax_received ? r.tax : 0), 0),
    [localRows]
  );

  const currentBalance = startingBalance + totalReceived;

  const monthlyAdultNightSum = useMemo(
    () =>
      localRows.reduce((sum, r) => {
        if (r.booking_site?.toLowerCase() === 'chillnn' || r.a_tax_received) {
          return sum + r.adult_count * r.nights;
        }
        return sum;
      }, 0),
    [localRows]
  );

  const handleToggle = useCallback((id, checked) => {
    setLocalRows(prev =>
      prev.map(r => (r.id === id ? { ...r, a_tax_received: checked } : r))
    );
  }, []);

  return (
    <Box>
      {/* month selector */}
      <MonthSelector
        selectedOption={selectedOption}
        previousLabel={previousLabel}
        currentLabel={currentLabel}
        onChange={setSelectedOption}
      />

      {/* CSV button (先月のみ) */}
      {selectedOption === "previous" && (
        <Box textAlign="center" mb={2}>
          <Button
            variant="outlined"
            onClick={() => {
              const csv = convertToCSV(processedRows);
              downloadCSV(csv, `${targetYear}-${targetMonth}-reservations.csv`);
            }}
          >
            CSVダウンロード（先月分）
          </Button>
        </Box>
      )}

      {/* Filter switch & balance */}
      <Box position="relative" mb={2} px={1}>
        {selectedOption === 'current' && (
          <Box
            position="absolute"
            left="1%"
            top="90%"
            sx={{ transform: 'translateY(-50%)' }}
          >
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={enableFilter}
                  onChange={e => setEnableFilter(e.target.checked)}
                  color="primary"
                />
              }
              label="filter"
              slotProps={{ variant: 'caption' }}
            />
          </Box>
        )}

        <Box display="flex" justifyContent="center">
          <BalanceDisplay
            startingBalance={startingBalance}
            currentBalance={currentBalance}
            monthlyAdultNightSum={monthlyAdultNightSum}
          />
        </Box>
      </Box>

      {/* main table */}
      <ReservationTable
        rows={localRows}
        loading={loading}
        onToggle={handleToggle}
        option={selectedOption}
        enableFilter={enableFilter}
        onProcessedRows={setProcessedRows}  // ★追加
      />
    </Box>
  );
};

export default ATaxTable;
