import { memo } from 'react';
import {
  Grid,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Checkbox,
  FormControlLabel,
  Typography,
  Box,
  Tooltip,
} from '@mui/material';
import {
  countryOptions,
  groupOptions,
  purposeOptions,
  tourismOptions,
  ageOptions,
} from '../constants/reservationOptions';
import {
  INLINE_ITEM_SIZE,
  INLINE_ITEM_SX,
  OTHER_NOTE_SX,
  SECTION_SPACING,
  AGE_SECTION_SPACING,
  createOptionLabelRenderer,
} from './ReservationCardSet2.constants.js';

const renderGroupLabel = createOptionLabelRenderer(groupOptions, '不明');
const renderPurposeLabel = createOptionLabelRenderer(purposeOptions, '不明');
const renderTourismLabel = createOptionLabelRenderer(tourismOptions, '未選択');
const renderAgeLabel = createOptionLabelRenderer(ageOptions, '未選択');

export const CardSection = memo(({ title, children, sx }) => (
  <Box
    sx={{
      mt: 2,
      p: 2,
      display: 'flex',
      flexDirection: 'column',
      gap: 1.5,
      borderRadius: 2,
      bgcolor: 'background.paper',
      ...sx,
    }}
  >
    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
      {title}
    </Typography>
    {children}
  </Box>
));

export const Section = memo(({ children, spacing = 1, sx }) => (
  <Grid container spacing={spacing} sx={sx}>
    {children}
  </Grid>
));

export const TextFieldItem = memo(({
  label,
  value,
  onChange,
  minWidth,
  disabled = false,
  size = INLINE_ITEM_SIZE,
  sx,
  textFieldProps,
}) => (
  <Grid sx={{ ...(minWidth ? { minWidth } : {}), ...sx }} size={size}>
    <TextField
      label={label}
      InputLabelProps={{ shrink: true }}
      fullWidth
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      {...{ size: 'small', ...(textFieldProps || {}) }}
    />
  </Grid>
));

export const SelectItem = memo(({
  label,
  value,
  options,
  onChange,
  renderValue,
  minWidth,
  disabled = false,
  size = INLINE_ITEM_SIZE,
  sx,
  dimValues,
}) => (
  <Grid sx={{ ...(minWidth ? { minWidth } : {}), ...sx }} size={size}>
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel id={`${label}-label`} shrink>
        {label}
      </InputLabel>
      <Select
        labelId={`${label}-label`}
        value={value}
        displayEmpty
        label={label}
        renderValue={renderValue}
        onChange={e => onChange(e.target.value)}
        size="small"
        sx={
          dimValues?.includes(value)
            ? { '& .MuiSelect-select': { color: 'text.disabled' } }
            : undefined
        }
      >
        {options.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  </Grid>
));

export const AgeSelect = memo(({ age, index, onChange }) => (
  <Grid size={INLINE_ITEM_SIZE} sx={INLINE_ITEM_SX}>
    <Tooltip title="大体の年齢を選択" placement="top" arrow>
      <Box sx={{ width: '100%' }}>
        <FormControl fullWidth size="small">
          <InputLabel id={`age-label-${index}`} shrink>
            {`大人${index + 1}の年齢`}
          </InputLabel>
          <Select
            labelId={`age-label-${index}`}
            id={`age-select-${index}`}
            value={age}
            displayEmpty
            label={`大人${index + 1}の年齢`}
            renderValue={renderAgeLabel}
            onChange={e => onChange(index, e.target.value)}
            size="small"
            sx={
              !age
                ? { '& .MuiSelect-select': { color: 'text.disabled' } }
                : undefined
            }
          >
            {ageOptions.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Tooltip>
  </Grid>
));

export const TaxSection = memo(({
  isChillnn,
  formattedTax,
  taxStatusLabel,
  taxNotice,
  taxReceived,
  onTaxToggle,
  taxStaffName,
  onTaxStaffNameChange,
}) => (
  <CardSection
    title={`①宿泊税 ${formattedTax}円`}
    sx={{ pt: 0, pb: 1 }}
  >
    <Section spacing={SECTION_SPACING}>
      <Grid size={INLINE_ITEM_SIZE} sx={INLINE_ITEM_SX}>
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(taxReceived)}
              onChange={e => onTaxToggle(e.target.checked)}
              disabled={isChillnn}
            />
          }
          label={
            <Box
              sx={{
                display: 'inline-flex',
                minWidth: '8ch',
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  fontSize: '0.85rem',
                  color: taxReceived ? 'text.primary' : 'text.disabled',
                }}
              >
                {taxStatusLabel}
              </Box>
            </Box>
          }
        />
      </Grid>
      <TextFieldItem
        label="受け取ったスタッフ名"
        value={taxStaffName}
        onChange={onTaxStaffNameChange}
        disabled={isChillnn}
        size={INLINE_ITEM_SIZE}
        sx={INLINE_ITEM_SX}
      />
    </Section>
    {taxNotice && (
      <Typography variant="body2" sx={{ color: 'text.secondary', ml: 1 }}>
        {taxNotice}
      </Typography>
    )}
  </CardSection>
));

export const MarketingSection = memo(({
  checkInStaffName,
  onCheckInStaffNameChange,
  countryOption,
  onCountryChange,
  city,
  onCityChange,
  ageGroups,
  onAgeGroupChange,
  shouldShowGroupType,
  groupType,
  onGroupTypeChange,
  purpose,
  onPurposeChange,
  showTourismDetail,
  tourismType,
  onTourismTypeChange,
  showProfessionField,
  profession,
  onProfessionChange,
  otherNote,
  onOtherNoteChange,
}) => (
  <CardSection
    title="②マーケティング情報"
    sx={{ mt: 0.75, pt: 1 }}
  >
    <Section spacing={SECTION_SPACING}>
      <TextFieldItem
        label="C/I 担当スタッフ名"
        value={checkInStaffName}
        onChange={onCheckInStaffNameChange}
        size={INLINE_ITEM_SIZE}
        sx={INLINE_ITEM_SX}
      />
      <Grid size={INLINE_ITEM_SIZE} sx={INLINE_ITEM_SX}>
        <Tooltip title="スクロールもしくはタイピングで検索" placement="top" arrow>
          <Box sx={{ width: '100%' }}>
            <Autocomplete
              disableClearable
              size="small"
              options={countryOptions}
              getOptionLabel={opt => opt.label}
              value={countryOption}
              onChange={(_, v) => onCountryChange(v?.value ?? '')}
              slotProps={{
                popper: {
                  placement: 'bottom-start',
                  modifiers: [
                    { name: 'flip', enabled: false },
                    { name: 'preventOverflow', options: { altAxis: false } },
                  ],
                },
              }}
              renderInput={params => (
                <TextField
                  {...params}
                  label="国名"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  size="small"
                  sx={{
                    '& .MuiInputBase-input': {
                      color:
                        !countryOption || countryOption.value === ''
                          ? 'text.disabled'
                          : 'text.primary',
                    },
                  }}
                />
              )}
            />
          </Box>
        </Tooltip>
      </Grid>
      <TextFieldItem
        label="都市名"
        value={city}
        onChange={onCityChange}
        size={INLINE_ITEM_SIZE}
        sx={INLINE_ITEM_SX}
      />
    </Section>

    <Section spacing={AGE_SECTION_SPACING}>
      {ageGroups.map((age, index) => (
        <AgeSelect
          key={index}
          age={age}
          index={index}
          onChange={onAgeGroupChange}
        />
      ))}
      {shouldShowGroupType && (
        <SelectItem
          label="グループ構成"
          value={groupType}
          options={groupOptions}
          onChange={onGroupTypeChange}
          renderValue={renderGroupLabel}
          size={INLINE_ITEM_SIZE}
          sx={INLINE_ITEM_SX}
          dimValues={['']}
        />
      )}
    </Section>

    <Section spacing={SECTION_SPACING}>
      <SelectItem
        label="目的"
        value={purpose}
        options={purposeOptions}
        onChange={onPurposeChange}
        renderValue={renderPurposeLabel}
        size={INLINE_ITEM_SIZE}
        sx={INLINE_ITEM_SX}
        dimValues={['']}
      />
      {showTourismDetail && (
        <SelectItem
          label="詳細"
          value={tourismType}
          options={tourismOptions}
          onChange={onTourismTypeChange}
          renderValue={renderTourismLabel}
          size={INLINE_ITEM_SIZE}
          sx={INLINE_ITEM_SX}
          dimValues={['']}
        />
      )}
      {showProfessionField && (
        <TextFieldItem
          label="職業"
          value={profession}
          onChange={onProfessionChange}
          size={INLINE_ITEM_SIZE}
          sx={INLINE_ITEM_SX}
        />
      )}
    </Section>

    <Section spacing={SECTION_SPACING}>
      <TextFieldItem
        label="その他"
        value={otherNote}
        onChange={onOtherNoteChange}
        size={{ xs: 12 }}
        sx={OTHER_NOTE_SX}
        textFieldProps={{
          placeholder: "上記以外で伺ったことがあれば記述 (改行可能)",
          multiline: true,
          minRows: 1,
        }}
      />
    </Section>
  </CardSection>
));
