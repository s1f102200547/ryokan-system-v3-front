'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

type Props = {
  totalReceived: number       // 受領済み税額の合計
  monthlyAdultNightSum: number // 大人人数×泊数の月合計
}

export function BalanceDisplay({ totalReceived, monthlyAdultNightSum }: Props) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, mb: 2 }}>
      <Typography variant="subtitle1">
        月合計(大人人数×泊数): {monthlyAdultNightSum.toLocaleString()}
      </Typography>
      <Typography variant="subtitle1">
        受領済み合計: ¥{totalReceived.toLocaleString()}
      </Typography>
    </Box>
  )
}
