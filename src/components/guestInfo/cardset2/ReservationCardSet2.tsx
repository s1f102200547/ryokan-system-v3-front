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
  onBlurFlush: () => void
}

export function ReservationCardSet2({ localData, onFieldChange, onBlurFlush }: Props) {
  const nights = dateDiff(localData.check_in_date, localData.check_out_date)
  const exempt = isATaxExempt(localData.booking_site)
  const tax = exempt ? 0 : calcATax(localData.adult_count, nights, A_TAX_RATE_PER_PERSON_PER_NIGHT)

  const selectedCountry = countryOptions.find((o) => o.value === (localData.country ?? '')) ?? countryOptions[0]
  const showGroupType = localData.age_groups.length >= 2
  const showTourismDetail = localData.purpose === 'tourism'
  const showProfession = localData.purpose === 'business'

  const compactGridSx = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 2,
    mb: 2,
    width: '100%',
  }

  return (
    <Box
      onBlur={onBlurFlush}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 2,
        alignItems: 'center',
        overflowY: 'auto',
        height: '100%',
        scrollbarWidth: 'thin',
        scrollbarColor: 'transparent transparent',
        '&::-webkit-scrollbar': { width: '4px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': { backgroundColor: 'transparent', borderRadius: '2px' },
        '&:hover': {
          scrollbarColor: 'rgba(0,0,0,0.15) transparent',
          '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(0,0,0,0.15)' },
        },
      }}
    >
      {/* ① 宿泊税 */}
      <Box sx={{ width: '95%', p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={600} mb={2}>
          ① 宿泊税 {!exempt && `¥${tax.toLocaleString()}`}
        </Typography>
        <Box sx={compactGridSx}>
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
            fullWidth
            disabled={exempt}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        {exempt && (
          <Typography variant="body2" color="text.secondary" mt={1}>
            Chillnn 予約のため宿泊税不要
          </Typography>
        )}
      </Box>

      <Divider sx={{ width: '80%' }} />

      {/* ② マーケティング情報 */}
      <Box sx={{ width: '95%', p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={600} mb={2}>② マーケティング情報</Typography>

        {/* 3列グリッド */}
        <Box sx={compactGridSx}>
            <TextField
              label="C/I 担当スタッフ名"
              value={localData.check_in_staff_name}
              onChange={(e) => onFieldChange('check_in_staff_name', e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          
          <Tooltip title="スクロールまたはタイピングで検索" placement="top" arrow>
            <Box>
              <Autocomplete
                disableClearable
                size="small"
                options={countryOptions}
                getOptionLabel={(o) => o.label}
                value={selectedCountry}
                onChange={(_, v) => onFieldChange('country', v?.value || null)}
                renderInput={(params) => (
                  <TextField {...params} label="国名" slotProps={{ inputLabel: { shrink: true } }} size="small" />
                )}
              />
            </Box>
          </Tooltip>

          <TextField
            label="都市名"
            value={localData.city}
            onChange={(e) => onFieldChange('city', e.target.value)}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <FormControl size="small" fullWidth>
            <InputLabel shrink>目的</InputLabel>
            <Select
              value={localData.purpose ?? ''}
              label="目的"
              displayEmpty
              onChange={(e) => {
                const val = e.target.value || null
                onFieldChange('purpose', val)
                if (val !== 'tourism') onFieldChange('tourism_type', null)
                if (val !== 'business') onFieldChange('profession', '')
              }}
              sx={!localData.purpose ? { '& .MuiSelect-select': { color: 'text.disabled' } } : undefined}
            >
              {purposeOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>

          {showTourismDetail && (
            <FormControl size="small" fullWidth>
              <InputLabel shrink>詳細（観光）</InputLabel>
              <Select
                value={localData.tourism_type ?? ''}
                label="詳細（観光）"
                displayEmpty
                onChange={(e) => onFieldChange('tourism_type', e.target.value || null)}
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
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        </Box>

        {/* 年齢グループ（adult_count 分）3列グリッド */}
        {localData.age_groups.length > 0 && (
          <Box sx={compactGridSx}>
            {localData.age_groups.map((age, i) => (
              <Tooltip key={i} title="大体の年齢を選択" placement="top" arrow>
                <FormControl size="small" fullWidth>
                  <InputLabel shrink>{`大人${i + 1}の年齢`}</InputLabel>
                  <Select
                    value={age ?? ''}
                    label={`大人${i + 1}の年齢`}
                    displayEmpty
                    onChange={(e) => {
                      const arr = [...localData.age_groups]
                      arr[i] = e.target.value || null
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
              <FormControl size="small" fullWidth>
                <InputLabel shrink>グループ構成</InputLabel>
                <Select
                  value={localData.group_type ?? ''}
                  label="グループ構成"
                  displayEmpty
                  onChange={(e) => onFieldChange('group_type', e.target.value || null)}
                  sx={!localData.group_type ? { '& .MuiSelect-select': { color: 'text.disabled' } } : undefined}
                >
                  {groupOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Box>
        )}

        <TextField
          label="その他"
          value={localData.other_note}
          onChange={(e) => onFieldChange('other_note', e.target.value)}
          size="small" fullWidth multiline minRows={1}
          slotProps={{ inputLabel: { shrink: true } }}
          placeholder="上記以外で伺ったことがあれば記述（改行可能）"
          sx={{ width: '100%' }}
        />
      </Box>
    </Box>
  )
}
