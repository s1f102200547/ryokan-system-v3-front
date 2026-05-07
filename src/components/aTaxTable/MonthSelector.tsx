'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'

type Props = {
  selectedOption: 'previous' | 'current'
  previousLabel: string
  currentLabel: string
  onChange: (option: 'previous' | 'current') => void
}

export function MonthSelector({ selectedOption, previousLabel, currentLabel, onChange }: Props) {
  return (
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
  )
}
