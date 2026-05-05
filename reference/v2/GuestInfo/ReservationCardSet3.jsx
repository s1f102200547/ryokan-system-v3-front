// src/components/ReservationCardSet3.jsx
import React from 'react';
import { Grid, FormControl, InputLabel, Select, MenuItem, TextField } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import jaLocale from 'date-fns/locale/ja';
import { ALL_ROOMS } from '../constants/constants';
import { MS_PER_DAY, parseDate, formatDate } from '../utils/dateUtils';

const countOptions = [0, 1, 2, 3];

export default function ReservationCardSet3({ localData, handleChange }) {
  const safeSelect = (options, val) => (options.includes(val) ? val : '');

  const checkIn = localData.check_in_date ? parseDate(localData.check_in_date) : null;
  const minCheckout = checkIn ? new Date(checkIn.getTime() + MS_PER_DAY) : null;
  const checkout = localData.check_out_date ? parseDate(localData.check_out_date) : null;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={jaLocale}>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* チェックアウト日 */}
        <Grid
          sx={{ minWidth: 272 }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <DatePicker
            label="チェックアウト日"
            value={checkout}
            minDate={minCheckout}
            onChange={(newDate) =>
              handleChange(
                'check_out_date',
                newDate ? formatDate(newDate) : ''
              )
            }
            slots={{ textField: TextField }}
            slotProps={{
              textField: {
                fullWidth: true
              }
            }}
          />
        </Grid>

        {/* 部屋 */}
        <Grid
          sx={{ minWidth: 95 }}
          size={{
            xs: 12,
            sm: 6
          }}>
          <FormControl fullWidth>
            <InputLabel shrink>部屋</InputLabel>
            <Select
              value={safeSelect(ALL_ROOMS, localData.room)}
              onChange={(e) => handleChange('room', e.target.value)}
              label="部屋"
            >
              {ALL_ROOMS.map((room) => (
                <MenuItem key={room} value={room}>
                  {room}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* 大人 */}
        <Grid
          sx={{minWidth:"60px"}}
          size={{
            xs: 12,
            sm: 3
          }}>
          <FormControl fullWidth>
            <InputLabel id="adult-count-label" shrink>
              大人
            </InputLabel>
            <Select
              labelId="adult-count-label"
              value={safeSelect(countOptions, localData.adult_count)}
              onChange={(e) => handleChange('adult_count', e.target.value)}
              label="大人"
            >
              {countOptions.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        {/* 子供 */}
        <Grid
          sx={{minWidth:"60px"}}
          size={{
            xs: 12,
            sm: 3
          }}>
          <FormControl fullWidth>
            <InputLabel id="child-count-label" shrink>
              子供
            </InputLabel>
            <Select
              labelId="child-count-label"
              value={safeSelect(countOptions, localData.child_count)}
              onChange={(e) => handleChange('child_count', e.target.value)}
              label="子供"
            >
              {countOptions.map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        {/* 氏名 */}
        <Grid
          sx={{minWidth:"247px"}}
          size={{
            xs: 12,
            sm: 6
          }}>
          <TextField
            fullWidth
            label="ゲスト名"
            value={localData.guest_name || ''}
            onChange={(e) => handleChange('guest_name', e.target.value)}
          />
        </Grid>
      </Grid>
    </LocalizationProvider>
  );
}
