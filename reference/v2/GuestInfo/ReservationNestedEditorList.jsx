// src/GuestInfoEditable/ReservationNestedEditorList.jsx
import React, { useState } from 'react';
import { Box, Card, Divider, List, Typography } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import jaLocale from 'date-fns/locale/ja';

import CollapsibleSection from './CollapsibleSection';
import TextFieldField from './fields/TextFieldField';
import MultiLineField from './fields/MultiLineField';
import SelectField from './fields/SelectField';
import MultiDaySelectField from './fields/MultiDaySelectField';
import DatePickerField from './fields/DatePickerField';

// アイコンはすべてデフォルトインポート
import adultAndChild from '../assets/icons/adultAndChild.png';
import door           from '../assets/icons/door.png';
import info            from '../assets/icons/info.png';
import landing         from '../assets/icons/landing.png';
import onsen           from '../assets/icons/onsen.png';
import pen             from '../assets/icons/pen.png';
import rice            from '../assets/icons/rice.png';
import sleep           from '../assets/icons/sleep.png';
import sukiyaki        from '../assets/icons/sukiyaki.png';
import takeOf          from '../assets/icons/takeOf.png';


import {
  arrivalOptions,
  rotenOptions,
  breakfastOptions,
  lateCOOptions,
  dinnerTimeOptions,
} from '../constants/reservationOptions';
import { DINNER_NONE } from '../constants/dinnerTime';
import { ALL_ROOMS } from '../constants/constants';
import { MS_PER_DAY, parseDate, formatDate } from '../utils/dateUtils';

export default function ReservationNestedEditorList({
  localData,
  nights,
  handleChange,
  handleArrayChange,
  handleLateOut,
}) {
  const [open, setOpen] = useState({
    guestName: false,
    room: false,
    count: false,
    checkout: false,
    arrival: false,
    roten: false,
    dinner: false,
    breakfast: false,
    lateOut: false,
    timetable: false,
  });
  const toggle = key =>
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));

  const checkIn = localData.check_in_date
    ? parseDate(localData.check_in_date)
    : null;
  const minCheckout = checkIn
    ? new Date(checkIn.getTime() + MS_PER_DAY)
    : null;
  const checkout = localData.check_out_date
    ? parseDate(localData.check_out_date)
    : null;

  const smallMenuProps = {
    PaperProps: {
      sx: {
        '& .MuiMenuItem-root': { py: 0.25, fontSize: '0.75rem' },
      },
    },
  };

  const roomOptions  = ALL_ROOMS.map(r => ({ value: r, label: r }));
  const countOptions = [0, 1, 2, 3].map(n => ({ value: n, label: String(n) }));

  return (
    <Card sx={{ background: '#ffffff', minHeight: '100vh' }}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={jaLocale}>
        <List dense disablePadding sx={{ fontSize: '0.75rem' }}>

          {/* ゲスト名 */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={pen} alt="name" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>name</Typography>
              </Box>
            }
            open={open.guestName}
            onToggle={() => toggle('guestName')}
          >
            <TextFieldField
              value={localData.guest_name || ''}
              onChange={v => handleChange('guest_name', v)}
            />
          </CollapsibleSection>

          {/* 部屋 */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={door} alt="door" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>room</Typography>
              </Box>
            }
            open={open.room}
            onToggle={() => toggle('room')}
          >
            <SelectField
              value={localData.room}
              onChange={v => handleChange('room', v)}
              options={roomOptions}
              menuProps={smallMenuProps}
            />
          </CollapsibleSection>

          {/* 人数 */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={adultAndChild} alt="number" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>number</Typography>
              </Box>
            }
            open={open.count}
            onToggle={() => toggle('count')}
          >
            <SelectField
              label="大人"
              value={localData.adult_count ?? ''}
              onChange={v => handleChange('adult_count', v)}
              options={countOptions}
              menuProps={smallMenuProps}
              allowUnspecified={false}
            />
            <SelectField
              label="子供"
              value={localData.child_count ?? ''}
              onChange={v => handleChange('child_count', v)}
              options={countOptions}
              menuProps={smallMenuProps}
              allowUnspecified={false}
            />
          </CollapsibleSection>

          {/* C/O date */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={takeOf} alt="C/O date" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>C/O date</Typography>
              </Box>
            }
            open={open.checkout}
            onToggle={() => toggle('checkout')}
          >
            <DatePickerField
              value={checkout}
              onChange={d => handleChange('check_out_date', d ? formatDate(d) : '')}
              minDate={minCheckout}
            />
          </CollapsibleSection>

          <Divider sx={{ my: 1, borderColor: 'rgba(0,0,0,0.12)' }} />

          {/* arrival */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={landing} alt="arrival" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>arrival</Typography>
              </Box>
            }
            open={open.arrival}
            onToggle={() => toggle('arrival')}
          >
            <SelectField
              value={localData.arrival_time}
              onChange={v => handleChange('arrival_time', v)}
              options={arrivalOptions}
              menuProps={smallMenuProps}
            />
          </CollapsibleSection>

          {/* openAirBath */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={onsen} alt="openAirBath" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>openAirBath</Typography>
              </Box>
            }
            open={open.roten}
            onToggle={() => toggle('roten')}
          >
            <MultiDaySelectField
              keyName="open_air_bath_time"
              nights={nights}
              values={localData.open_air_bath_time}
              onChange={handleArrayChange}
              options={rotenOptions}
              menuProps={smallMenuProps}
            />
          </CollapsibleSection>

          {/* dinner */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={sukiyaki} alt="dinner" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>dinner</Typography>
              </Box>
            }
            open={open.dinner}
            onToggle={() => toggle('dinner')}
          >
            {Array.from({ length: nights }).map((_, i) => (
              <Box key={i} sx={{ mb: i < nights - 1 ? 0.75 : 0 }}>
                <SelectField
                  label={`Day ${i + 1}`}
                  value={localData.dinner_time?.[i] ?? ''}
                  onChange={v => handleArrayChange('dinner_time', i, v)}
                  options={dinnerTimeOptions}
                  menuProps={smallMenuProps}
                  allowUnspecified={false}
                />
                {(localData.dinner_time?.[i] ?? DINNER_NONE) !== DINNER_NONE && (
                  <Box sx={{ mt: -0.5 }}>
                    <MultiLineField
                      value={localData.dinner_info?.[i] || ''}
                      onChange={v => handleArrayChange('dinner_info', i, v)}
                      maxRows={null}
                    />
                  </Box>
                )}
              </Box>
            ))}
          </CollapsibleSection>

          {/* breakfast */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={rice} alt="breakfast" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>breakfast</Typography>
              </Box>
            }
            open={open.breakfast}
            onToggle={() => toggle('breakfast')}
          >
            <MultiDaySelectField
              keyName="breakfast_time"
              nights={nights}
              values={localData.breakfast_time}
              onChange={handleArrayChange}
              options={breakfastOptions}
              menuProps={smallMenuProps}
            />
          </CollapsibleSection>

          {/* lateOut */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={sleep} alt="lateOut" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>lateOut</Typography>
              </Box>
            }
            open={open.lateOut}
            onToggle={() => toggle('lateOut')}
          >
            <SelectField
              value={localData.late_out}
              onChange={v => handleChange('late_out', v)}  // または handleLateOut(v) に合わせて
              options={lateCOOptions}
              menuProps={smallMenuProps}
              allowUnspecified={false}
            />
          </CollapsibleSection>

          <Divider sx={{ my: 1, borderColor: 'rgba(0,0,0,0.12)' }} />

          {/* タイムテーブルメモ */}
          <CollapsibleSection
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box component="img" src={info} alt="timeTableMemo" sx={{ width: 16, height: 16 }} />
                <Typography sx={{ fontSize: '0.75rem' }}>timeTableMemo</Typography>
              </Box>
            }
            open={open.timetable}
            onToggle={() => toggle('timetable')}
          >
            {Array.from({ length: nights }).map((_, i) => (
              <MultiLineField
                key={i}
                label={`Day ${i + 1}`}
                value={localData.timetable_info[i] || ''}
                onChange={v => handleArrayChange('timetable_info', i, v)}
              />
            ))}
          </CollapsibleSection>

        </List>
      </LocalizationProvider>
    </Card>
  );
}
