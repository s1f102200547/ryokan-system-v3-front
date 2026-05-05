import React from 'react';
import {
  ListItem,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';

export default function SelectField({
  label = '',
  value,
  onChange,
  options = [],
  menuProps,
  allowUnspecified = true,
}) {
  // 空文字 or null のときに表示するラベル
  const renderValue = (selected) => {
    if (!allowUnspecified) {
      // 未定表示をしない場合、空値は空文字
      return selected == null || selected === '' ? '' : (
        options.find(o => o.value === selected)?.label || selected
      );
    }
    if (selected === '' || selected == null) {
      return '未定';
    }
    // options の中から選択中の label を探して返す
    const opt = options.find(o => o.value === selected);
    return opt ? opt.label : selected;
  };

  return (
    <ListItem dense sx={{ py: 0 }}>
      <FormControl
        fullWidth
        size="small"
        margin="dense"
        variant="outlined"
        sx={{
          '& .MuiOutlinedInput-root': {
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(0,0,0,0.23)',
            },
          },
        }}
      >
        <InputLabel
          shrink
          sx={{
            fontSize: '0.75rem',
            '&.Mui-focused': {
              color: 'rgba(0,0,0,0.75)',
            },
          }}
        >
          {label}
        </InputLabel>
        <Select
          label={label}
          size="small"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          sx={{ fontSize: '0.7rem', py: 0 }}
          MenuProps={menuProps}
          {...(allowUnspecified
            ? { displayEmpty: true, renderValue }
            : {}
          )}
        >
          {allowUnspecified && (
              <MenuItem value="" sx={{ fontSize: '0.7rem', py: 0 }}>
                未定
              </MenuItem>
            )}
          {options.map(opt => (
            <MenuItem
              key={opt.value}
              value={opt.value}
              sx={{ fontSize: '0.7rem', py: 0 }}
            >
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </ListItem>
  );
}
