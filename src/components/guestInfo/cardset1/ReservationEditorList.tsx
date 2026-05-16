'use client'

import { useState, memo } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
import {
  arrivalOptions,
  rotenOptions,
  breakfastOptions,
  dinnerTimeOptions,
  lateCOOptions,
  DINNER_NONE,
} from '@/constants/guestInfo'
import { ROOM_NUMBERS } from '@/constants/room'
import type { Reservation } from '@/types/reservation'
import type { ReservationPatch } from '@/types/guestInfo'

type Props = {
  localData: Reservation
  nights: number
  onFieldChange: (field: keyof ReservationPatch, value: unknown) => void
}

type SectionKey = 'guestName' | 'room' | 'count' | 'checkout' | 'arrival' | 'roten' | 'dinner' | 'breakfast' | 'lateOut' | 'timetable'

const ICONS: Record<SectionKey, string> = {
  guestName: '/icons/pen.png',
  room:      '/icons/door.png',
  count:     '/icons/adultAndChild.png',
  checkout:  '/icons/takeOf.png',
  arrival:   '/icons/landing.png',
  roten:     '/icons/onsen.png',
  dinner:    '/icons/sukiyaki.png',
  breakfast: '/icons/rice.png',
  lateOut:   '/icons/sleep.png',
  timetable: '/icons/info.png',
}

const LABELS: Record<SectionKey, string> = {
  guestName: 'name',
  room:      'room',
  count:     'number',
  checkout:  'C/O date',
  arrival:   'arrival',
  roten:     'openAirBath',
  dinner:    'dinner',
  breakfast: 'breakfast',
  lateOut:   'lateOut',
  timetable: 'timeTableMemo',
}

const roomOptions = ROOM_NUMBERS.map((r) => ({ value: r, label: r }))
const countOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: n, label: String(n) }))

const menuProps = {
  PaperProps: { sx: { '& .MuiMenuItem-root': { minHeight: 23, py: 0, fontSize: '0.67rem' } } },
}

const compactInputSx = {
  '& .MuiInputBase-root': { minHeight: 24, fontSize: '0.67rem' },
  '& .MuiInputBase-input': { py: 0, px: 0, fontSize: '0.67rem' },
  '& .MuiPickersInputBase-root': { minHeight: 24, fontSize: '0.67rem' },
  '& .MuiPickersInputBase-sectionsContainer': { py: 0, px: 0, fontSize: '0.67rem' },
  '& .MuiInputAdornment-root .MuiIconButton-root': { p: 0.15 },
  '& .MuiSvgIcon-root': { fontSize: '0.8rem' },
  '& .MuiSelect-select': { minHeight: 'unset !important', py: '2px !important', px: '6px !important', fontSize: '0.67rem' },
  '& .MuiInputLabel-root': { fontSize: '0.67rem' },
}

const timetableMemoInputSx = {
  ...compactInputSx,
  '& .MuiInputBase-input': {
    py: 0,
    px: 0,
    fontSize: '0.64rem',
  },
}

function SectionHeader({ sectionKey, open, onToggle }: { sectionKey: SectionKey; open: boolean; onToggle: () => void }) {
  return (
    <ListItemButton dense onClick={onToggle} disableRipple sx={{ py: 0.25, px: 1 }}>
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="img" src={ICONS[sectionKey]} alt={sectionKey} sx={{ width: 14, height: 14 }} />
            <Typography sx={{ fontSize: '0.8rem' }}>{LABELS[sectionKey]}</Typography>
          </Box>
        }
      />
      {open
        ? <ExpandLess fontSize="small" sx={{ color: 'text.disabled', opacity: 0.6 }} />
        : <ExpandMore fontSize="small" sx={{ color: 'text.disabled', opacity: 0.6 }} />
      }
    </ListItemButton>
  )
}

function FieldSelect({ label, value, options, onChange }: {
  label?: string
  value: unknown
  options: { value: unknown; label: string }[]
  onChange: (v: unknown) => void
}) {
  return (
    <FormControl
      fullWidth
      size="small"
      sx={{
        px: 1,
        mt: label ? 1 : 0,
        pt: 0.35,
        pb: 0.55,
        ...compactInputSx,
      }}
    >
      {label && <InputLabel shrink>{label}</InputLabel>}
      <Select
        value={value ?? ''}
        label={label}
        displayEmpty={true}
        onChange={(e) => onChange(e.target.value)}
        MenuProps={menuProps}
        size="small"
        sx={compactInputSx}
      >
        {options.map((opt) => (
          <MenuItem key={String(opt.value)} value={opt.value as string | number}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export const ReservationEditorList = memo(function ReservationEditorList({ localData, nights, onFieldChange }: Props) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    guestName: false, room: false, count: false, checkout: false,
    arrival: false, roten: false, dinner: false, breakfast: false,
    lateOut: false, timetable: false,
  })

  const toggle = (key: SectionKey) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))

  const minCheckout = dayjs(localData.check_in_date).add(1, 'day')

  return (
    <Card elevation={0} sx={{ background: '#ffffff', minHeight: '100%' }}>
      <List dense disablePadding sx={{ fontSize: '0.75rem' }}>

        {/* ゲスト名 */}
        <SectionHeader sectionKey="guestName" open={open.guestName} onToggle={() => toggle('guestName')} />
        <Collapse in={open.guestName} timeout="auto" unmountOnExit>
          <Box sx={{ px: 1, py: 0.65 }}>
            <TextField
              value={localData.guest_name}
              onChange={(e) => onFieldChange('guest_name', e.target.value)}
              size="small" fullWidth variant="standard"
              inputProps={{ 'aria-label': 'ゲスト名' }}
              sx={compactInputSx}
            />
          </Box>
        </Collapse>

        {/* 部屋 */}
        <SectionHeader sectionKey="room" open={open.room} onToggle={() => toggle('room')} />
        <Collapse in={open.room} timeout="auto" unmountOnExit>
          <FieldSelect value={localData.room ?? ''} options={[{ value: '', label: '未アサイン' }, ...roomOptions]} onChange={(v) => onFieldChange('room', (v as string) || null)} />
        </Collapse>

        {/* 人数 */}
        <SectionHeader sectionKey="count" open={open.count} onToggle={() => toggle('count')} />
        <Collapse in={open.count} timeout="auto" unmountOnExit>
          <FieldSelect label="大人" value={localData.adult_count} options={countOptions} onChange={(v) => onFieldChange('adult_count', Number(v))} />
          <FieldSelect label="子供" value={localData.child_count} options={countOptions} onChange={(v) => onFieldChange('child_count', Number(v))} />
        </Collapse>

        {/* C/O date */}
        <SectionHeader sectionKey="checkout" open={open.checkout} onToggle={() => toggle('checkout')} />
        <Collapse in={open.checkout} timeout="auto" unmountOnExit>
          <Box sx={{ px: 1, py: 0.65 }}>
            <DatePicker
              value={dayjs(localData.check_out_date)}
              minDate={minCheckout}
              onChange={(v) => v && onFieldChange('check_out_date', v.format('YYYY-MM-DD'))}
              slotProps={{ textField: { size: 'small', fullWidth: true, sx: compactInputSx } }}
            />
          </Box>
        </Collapse>

        <Divider sx={{ my: 1, borderColor: 'rgba(0,0,0,0.12)' }} />

        {/* arrival */}
        <SectionHeader sectionKey="arrival" open={open.arrival} onToggle={() => toggle('arrival')} />
        <Collapse in={open.arrival} timeout="auto" unmountOnExit>
          <FieldSelect value={localData.arrival_time ?? ''} options={[{ value: '', label: '未定' }, ...arrivalOptions]} onChange={(v) => onFieldChange('arrival_time', v || null)} />
        </Collapse>

        {/* openAirBath */}
        <SectionHeader sectionKey="roten" open={open.roten} onToggle={() => toggle('roten')} />
        <Collapse in={open.roten} timeout="auto" unmountOnExit>
          {Array.from({ length: nights }).map((_, i) => (
            <FieldSelect key={i} label={`Day ${i + 1}`} value={localData.open_air_bath_time[i] ?? ''}
              options={[{ value: '', label: '未定' }, ...rotenOptions]}
              onChange={(v) => {
                const arr = [...localData.open_air_bath_time]
                arr[i] = (v as string) || null
                onFieldChange('open_air_bath_time', arr)
              }} />
          ))}
        </Collapse>

        {/* dinner */}
        <SectionHeader sectionKey="dinner" open={open.dinner} onToggle={() => toggle('dinner')} />
        <Collapse in={open.dinner} timeout="auto" unmountOnExit>
          {Array.from({ length: nights }).map((_, i) => (
            <Box key={i} sx={{ mb: i < nights - 1 ? 0.75 : 0 }}>
              <FieldSelect label={`Day ${i + 1}`} value={localData.dinner_time[i] ?? DINNER_NONE}
                options={dinnerTimeOptions}
                onChange={(v) => {
                  const arr = [...localData.dinner_time]
                  arr[i] = v as string
                  onFieldChange('dinner_time', arr)
                }} />
              {(localData.dinner_time[i] ?? DINNER_NONE) !== DINNER_NONE && (
                <Tooltip title="dinner_infoは現在使用してません" placement="top">
                  <Box sx={{ px: 1, py: 0.65 }}>
                    <TextField
                      value={localData.dinner_info[i] ?? ''}
                      disabled
                      size="small" fullWidth multiline minRows={1}
                      placeholder="dinner_info"
                      sx={compactInputSx}
                    />
                  </Box>
                </Tooltip>
              )}
            </Box>
          ))}
        </Collapse>

        {/* breakfast */}
        <SectionHeader sectionKey="breakfast" open={open.breakfast} onToggle={() => toggle('breakfast')} />
        <Collapse in={open.breakfast} timeout="auto" unmountOnExit>
          {Array.from({ length: nights }).map((_, i) => (
            <FieldSelect key={i} label={`Day ${i + 1}`} value={localData.breakfast_time[i] ?? ''}
              options={[{ value: '', label: '未定' }, ...breakfastOptions]}
              onChange={(v) => {
                const arr = [...localData.breakfast_time]
                arr[i] = (v as string) || null
                onFieldChange('breakfast_time', arr)
              }} />
          ))}
        </Collapse>

        {/* lateOut */}
        <SectionHeader sectionKey="lateOut" open={open.lateOut} onToggle={() => toggle('lateOut')} />
        <Collapse in={open.lateOut} timeout="auto" unmountOnExit>
          <FieldSelect value={localData.late_out} options={lateCOOptions} onChange={(v) => onFieldChange('late_out', Number(v))} />
        </Collapse>

        <Divider sx={{ my: 1, borderColor: 'rgba(0,0,0,0.12)' }} />

        {/* timetable */}
        <SectionHeader sectionKey="timetable" open={open.timetable} onToggle={() => toggle('timetable')} />
        <Collapse in={open.timetable} timeout="auto" unmountOnExit>
          {Array.from({ length: nights }).map((_, i) => (
            <Box key={i} sx={{ px: 1, pt: 1.15, pb: 0.65 }}>
              <TextField
                label={`Day ${i + 1}`}
                slotProps={{ inputLabel: { shrink: true } }}
                value={localData.timetable_info[i] ?? ''}
                onChange={(e) => {
                  const arr = [...localData.timetable_info]
                  arr[i] = e.target.value
                  onFieldChange('timetable_info', arr)
                }}
                size="small" fullWidth multiline minRows={3}
                sx={timetableMemoInputSx}
              />
            </Box>
          ))}
        </Collapse>

      </List>
    </Card>
  )
})
