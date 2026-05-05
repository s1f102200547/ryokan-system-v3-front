// src/components/MultiLineField.jsx
import React from 'react';
import { ListItem, TextField } from '@mui/material';

export default function MultiLineField({
  label = '',
  value,
  onChange,
  maxRows = 3,
}) {
  return (
    <ListItem dense sx={{ py: 0 }}>
      <TextField
        fullWidth
        multiline
        minRows={3}
        {...(maxRows == null ? {} : { maxRows })}
        size="small"
        margin="dense"
        variant="outlined"
        label={label || undefined}
        InputLabelProps={
          label
            ? {
                style: { fontSize: '0.75rem' },
                sx: {
                  '&.Mui-focused': {
                    color: 'rgba(0,0,0,0.75)',
                  },
                },
              }
            : undefined
        }
        inputProps={{
          style: {
            fontSize: '0.65rem',
            padding: "0",
            resize: 'none',
            overflow: 'hidden',
            lineHeight: '1.5',
          },
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          '& .MuiOutlinedInput-root': {
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(0,0,0,0.23)',
            },
          },
        }}
      />
    </ListItem>
  );
}
