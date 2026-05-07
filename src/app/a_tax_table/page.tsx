import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { ATaxTable } from '@/components/aTaxTable/ATaxTable'

export default function ATaxTablePage() {
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <Typography variant="h6" fontWeight={700} mb={2}>
        宿泊税管理
      </Typography>
      <Box>
        <ATaxTable />
      </Box>
    </Container>
  )
}
