'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import type { DailyTodo } from '@/domain/ports/dailyRepository'

type Props = {
  todos: DailyTodo[]
  onAdd: (text: string) => void
  onRemove: (id: string) => void
}

export function DailyTodoEditor({ todos, onAdd, onRemove }: Props) {
  const [inputValue, setInputValue] = useState('')

  const handleAdd = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
        タイテ用 Todo
      </Typography>
      <TextField
        size="small"
        fullWidth
        placeholder="todo を追加 (ex. 送迎あり 15:30)"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleAdd}
                  disabled={!inputValue.trim()}
                  aria-label="todo を追加"
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          },
          inputLabel: { shrink: true },
        }}
        sx={{
          mt: 0.5,
          '& .MuiInputBase-input': { fontSize: '11.5px' },
        }}
      />
      {todos.length > 0 && (
        <List dense disablePadding sx={{ mt: 0.5 }}>
          {todos.map((todo) => (
            <ListItem
              key={todo.id}
              disableGutters
              secondaryAction={
                <IconButton
                  size="small"
                  edge="end"
                  onClick={() => onRemove(todo.id)}
                  aria-label={`"${todo.text}" を削除`}
                >
                  <CloseIcon sx={{ fontSize: '14px' }} />
                </IconButton>
              }
              sx={{ py: 0 }}
            >
              <ListItemText
                primary={`▢ ${todo.text}`}
                slotProps={{ primary: { sx: { fontSize: '11.5px' } } }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
