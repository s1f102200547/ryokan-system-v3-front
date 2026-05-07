'use client'

import Card from '@mui/material/Card'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'

type Props = {
  onClick: () => void
}

export function AddReservationCard({ onClick }: Props) {
  return (
    <Tooltip title="新規予約追加" placement="top">
      <Card
        onClick={onClick}
        data-testid="add-reservation-card"
        sx={{
          width: 120,
          height: 120,
          m: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.paper',
          transition: 'background-color 0.2s',
          '&:hover': { bgcolor: 'grey.100' },
          '&:active': { bgcolor: 'grey.200' },
        }}
      >
        <IconButton size="large" sx={{ p: 0 }} tabIndex={-1}>
          <AddCircleOutlineIcon fontSize="large" />
        </IconButton>
      </Card>
    </Tooltip>
  )
}
