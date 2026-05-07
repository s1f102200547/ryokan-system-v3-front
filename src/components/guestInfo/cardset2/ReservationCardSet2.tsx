'use client'

import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  countryOptions,
  groupOptions,
  purposeOptions,
  tourismOptions,
  ageOptions,
  A_TAX_RATE_PER_PERSON_PER_NIGHT,
} from '@/constants/guestInfo'
import { isATaxExempt, calcATax } from '@/domain/reservation/bookingSitePolicy'
import { dateDiff } from '@/lib/dateUtils'
import type { Reservation } from '@/types/reservation'
import type { ReservationPatch } from '@/types/guestInfo'

type Props = {
  localData: Reservation
  onFieldChange: (field: keyof ReservationPatch, value: unknown) => void
}

export function ReservationCardSet2({ localData, onFieldChange }: Props) {
  const nights = dateDiff(localData.check_in_date, localData.check_out_date)
  const exempt = isATaxExempt(localData.booking_site)
  const tax = exempt ? 0 : calcATax(localData.adult_count, nights, A_TAX_RATE_PER_PERSON_PER_NIGHT)

  const selectedCountry = countryOptions.find((o) => o.value === localData.country) ?? countryOptions[0]
  const showGroupType = localData.age_groups.length >= 2
  const showTourismDetail = localData.purpose === 'tourism'
  const showProfession = localData.purpose === 'business'

  const fieldSx = { minWidth: 160 }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, overflowY: 'auto', height: '100%' }}>

      {/* ① 宿泊税 */}
      <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>
          ① 宿泊税 {exempt ? '（免除）' : `¥${tax.toLocaleString()}`}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={localData.a_tax_received}
                onChange={(e) => onFieldChange('a_tax_received', e.target.checked)}
                disabled={exempt}
              />
            }
            label={
              <Typography variant="body2" color={localData.a_tax_received ? 'text.primary' : 'text.disabled'}>
                {localData.a_tax_received ? '受領済み' : '未受領'}
              </Typography>
            }
          />
          <TextField
            label="受け取ったスタッフ名"
            value={localData.a_tax_received_by_staff_name}
            onChange={(e) => onFieldChange('a_tax_received_by_staff_name', e.target.value)}
            size="small"
            disabled={exempt}
            sx={fieldSx}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        {exempt && (
          <Typography variant="body2" color="text.secondary" mt={1}>
            Chillnn 予約のため宿泊税不要
          </Typography>
        )}
      </Box>

      <Divider />

      {/* ② マーケティング情報 */}
      <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={600} mb={1}>② マーケティング情報</Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField
            label="C/I 担当スタッフ名"
            value={localData.check_in_staff_name}
            onChange={(e) => onFieldChange('check_in_staff_name', e.target.value)}
            size="small" sx={fieldSx} InputLabelProps={{ shrink: true }}
          />
          <Tooltip title="スクロールまたはタイピングで検索" placement="top" arrow>
            <Box sx={fieldSx}>
              <Autocomplete
                disableClearable
                size="small"
                options={countryOptions}
                getOptionLabel={(o) => o.label}
                value={selectedCountry}
                onChange={(_, v) => onFieldChange('country', v?.value ?? '')}
                renderInput={(params) => (
                  <TextField {...params} label="国名" InputLabelProps={{ shrink: true }} size="small" />
                )}
              />
            </Box>
          </Tooltip>
          <TextField
            label="都市名"
            value={localData.city}
            onChange={(e) => onFieldChange('city', e.target.value)}
            size="small" sx={fieldSx} InputLabelProps={{ shrink: true }}
          />
        </Box>

        {/* 年齢グループ（adult_count 分） */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          {localData.age_groups.map((age, i) => (
            <Tooltip key={i} title="大体の年齢を選択" placement="top" arrow>
              <FormControl size="small" sx={fieldSx}>
                <InputLabel shrink>{`大人${i + 1}の年齢`}</InputLabel>
                <Select
                  value={age}
                  label={`大人${i + 1}の年齢`}
                  displayEmpty
                  onChange={(e) => {
                    const arr = [...localData.age_groups]
                    arr[i] = e.target.value
                    onFieldChange('age_groups', arr)
                  }}
                  sx={!age ? { '& .MuiSelect-select': { color: 'text.disabled' } } : undefined}
                >
                  {ageOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Tooltip>
          ))}
          {showGroupType && (
            <FormControl size="small" sx={fieldSx}>
              <InputLabel shrink>グループ構成</InputLabel>
              <Select
                value={localData.group_type}
                label="グループ構成"
                displayEmpty
                onChange={(e) => onFieldChange('group_type', e.target.value)}
                sx={!localData.group_type ? { '& .MuiSelect-select': { color: 'text.disabled' } } : undefined}
              >
                {groupOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <FormControl size="small" sx={fieldSx}>
            <InputLabel shrink>目的</InputLabel>
            <Select
              value={localData.purpose}
              label="目的"
              displayEmpty
              onChange={(e) => {
                onFieldChange('purpose', e.target.value)
                if (e.target.value !== 'tourism') onFieldChange('tourism_type', '')
                if (e.target.value !== 'business') onFieldChange('profession', '')
              }}
              sx={!localData.purpose ? { '& .MuiSelect-select': { color: 'text.disabled' } } : undefined}
            >
              {purposeOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          {showTourismDetail && (
            <FormControl size="small" sx={fieldSx}>
              <InputLabel shrink>詳細</InputLabel>
              <Select
                value={localData.tourism_type}
                label="詳細"
                displayEmpty
                onChange={(e) => onFieldChange('tourism_type', e.target.value)}
                sx={!localData.tourism_type ? { '& .MuiSelect-select': { color: 'text.disabled' } } : undefined}
              >
                {tourismOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          {showProfession && (
            <TextField
              label="職業"
              value={localData.profession}
              onChange={(e) => onFieldChange('profession', e.target.value)}
              size="small" sx={fieldSx} InputLabelProps={{ shrink: true }}
            />
          )}
        </Box>

        <TextField
          label="その他"
          value={localData.other_note}
          onChange={(e) => onFieldChange('other_note', e.target.value)}
          size="small" fullWidth multiline minRows={1}
          InputLabelProps={{ shrink: true }}
          placeholder="上記以外で伺ったことがあれば記述（改行可能）"
        />
      </Box>
    </Box>
  )
}
