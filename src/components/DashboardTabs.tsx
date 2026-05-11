'use client'

import type { MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

const DASHBOARD_PATH = '/daily-dashboard'
const A_TAX_TABLE_PATH = '/a_tax_table'

export function DashboardTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const value = pathname === A_TAX_TABLE_PATH ? A_TAX_TABLE_PATH : DASHBOARD_PATH

  const handleChange = (_event: MouseEvent<HTMLElement>, nextValue: string | null) => {
    if (nextValue !== null && nextValue !== value) {
      router.push(nextValue)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        width: '100vw',
        ml: 'calc(50% - 50vw)',
        py: 0.5,
        mb: 1,
        borderBottom: '1px solid',
        borderColor: 'grey.300',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
        '@media print': { display: 'none' },
      }}
    >
      <ToggleButtonGroup
        color="primary"
        size="small"
        value={value}
        exclusive
        onChange={handleChange}
        aria-label="画面切り替え"
        sx={{
          '& .MuiToggleButton-root': {
            minWidth: 108,
            height: 28,
            px: 1.5,
            textTransform: 'none',
          },
        }}
      >
        <ToggleButton
          value={DASHBOARD_PATH}
          aria-label="ダッシュボード"
        >
          ダッシュボード
        </ToggleButton>
        <ToggleButton
          value={A_TAX_TABLE_PATH}
          aria-label="宿泊税"
        >
          宿泊税
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  )
}
