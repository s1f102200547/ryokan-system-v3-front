'use client'

import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { DashboardTabs } from '@/components/DashboardTabs'
import { ATaxTable } from '@/components/aTaxTable/ATaxTable'

export default function ATaxTablePage() {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <DashboardTabs />

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          宿泊税管理
        </Typography>
      </Box>
      <ATaxTable />
    </Container>
  )
}
