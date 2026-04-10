import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export default function TimeRestrictedPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
        p: 4,
      }}
    >
      <Typography variant="h5" component="h1">
        深夜時間帯はアクセスが禁止されています
      </Typography>
      <Typography variant="body1" color="text.secondary">
        利用可能時間: 6:00 〜 23:00（JST）
      </Typography>
    </Box>
  )
}
