'use client'

import NextLink from 'next/link'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { ATaxTable } from '@/components/aTaxTable/ATaxTable'

export default function ATaxTablePage() {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          宿泊税管理
        </Typography>
        <Button
          component={NextLink}
          href="/daily-dashboard"
          size="small"
          variant="text"
          sx={{ textTransform: 'none', fontSize: '0.8rem', color: 'text.secondary' }}
        >
          ← ダッシュボード
        </Button>
      </Box>
      <ATaxTable />
    </Container>
  )
}
