// src/components/BalanceDisplay.jsx
import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * 残高表示コンポーネント
 * - 月初め金庫額
 * - 現在の残高
 * - 大人人数×泊数 の月合計
 */
const BalanceDisplay = ({
  startingBalance,
  currentBalance,
  monthlyAdultNightSum
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      mb: 2
    }}
  >
      <Typography variant="subtitle1">
      月合計(大人人数×泊数): {monthlyAdultNightSum.toLocaleString()}
    </Typography>
    <Typography variant="subtitle1">
      現在の残高: ¥{currentBalance.toLocaleString()}
    </Typography>
  </Box>
);

export { BalanceDisplay };
