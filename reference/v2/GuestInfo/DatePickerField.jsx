import React from 'react';
import { ListItem, TextField } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';

export default function DatePickerField({
  label = '',
  value,
  onChange,
  minDate,
}) {
  return (
    <ListItem dense sx={{ py: 0 }}>
      <DatePicker
        label={label}
        value={value}
        minDate={minDate}
        onChange={onChange}
        // ① 使用コンポーネントを指定
        slots={{ textField: TextField }}
        // ② TextField に渡すすべての props をまとめる
        slotProps={{
          textField: {
            fullWidth: true,
            size: 'small',
            margin: 'dense',
            variant: 'outlined',
            sx: {
              fontSize: '0.75rem',
              '& .MuiOutlinedInput-root': {
                py: 0.25,
                height: 28,
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'rgba(0,0,0,0.23)',
                },
              },
              '& .MuiInputBase-input': {
                fontSize: '0.7rem',
                padding: '4px 8px',
              },
              '& .MuiInputLabel-root': {
                '&.Mui-focused': {
                  color: 'rgba(0,0,0,0.75)',
                },
              },
            },
            InputLabelProps: {
              sx: {
                '&.Mui-focused': {
                  color: 'rgba(0,0,0,0.75)',
                },
              },
            },
          },
        }}
      />
    </ListItem>
  );
}
