import React from 'react';
import { ListItem, TextField } from '@mui/material';

export default function TextFieldField({
  label = '',
  value,
  onChange,
}) {
  return (
    <ListItem dense sx={{ py: 0 }}>
      <TextField
        fullWidth
        size="small"
        margin="dense"
        variant="standard"
        label={label}
        InputLabelProps={{
          style: { fontSize: '0.75rem' },
          sx: {
            '&.Mui-focused': {
              color: 'rgba(0,0,0,0.75)',
            },
          },
        }}
        inputProps={{
          style: {
            fontSize: '0.75rem',
            padding: '4px 8px',
          },
        }}
        value={value}
        onChange={e => onChange(e.target.value)}
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
