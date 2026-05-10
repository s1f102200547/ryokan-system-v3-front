'use client'

import Container from '@mui/material/Container'
import { DashboardTabs } from '@/components/DashboardTabs'
import { ATaxTable } from '@/components/aTaxTable/ATaxTable'

export default function ATaxTablePage() {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <DashboardTabs />
      <ATaxTable />
    </Container>
  )
}
