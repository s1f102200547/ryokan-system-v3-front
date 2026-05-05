// src/components/MonthSelector.jsx
import React from 'react';
import { Box, Button, ButtonGroup } from '@mui/material';

/**
 * selectedOption: 'previous' | 'current'
 * previousLabel: 先月のボタン文言
 * currentLabel: 今月のボタン文言
 */
const MonthSelector = ({ selectedOption, previousLabel, currentLabel, onChange }) => (
  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
    <ButtonGroup variant="contained">
      <Button
        color={selectedOption === 'previous' ? 'primary' : 'inherit'}
        onClick={() => onChange('previous')}
      >
        {previousLabel}
      </Button>
      <Button
        color={selectedOption === 'current' ? 'primary' : 'inherit'}
        onClick={() => onChange('current')}
      >
        {currentLabel}
      </Button>
    </ButtonGroup>
  </Box>
);

export default MonthSelector;
