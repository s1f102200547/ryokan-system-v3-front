'use client'

import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
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
  isLoading: boolean
  error: string | null
  isSaving: boolean
  saveError: string | null
  onAdd: (text: string) => void
  onRemove: (id: string) => void
}

export function DailyTodoEditor({ todos, isLoading, error, isSaving, saveError, onAdd, onRemove }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DailyTodo | null>(null)
  const hasPendingInput = inputValue.length > 0

  const handleAdd = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
    }
  }

  const handleConfirmDelete = () => {
    if (deleteTarget) onRemove(deleteTarget.id)
    setDeleteTarget(null)
  }

  const disabled = isLoading || isSaving

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
          Todo (タイテ右上に表示)
        </Typography>
        {isSaving && <CircularProgress size={10} />}
      </Box>

      {error && (
        <Alert severity="error" sx={{ py: 0, fontSize: '11px', mb: 0.5 }}>
          {error}
        </Alert>
      )}
      {saveError && (
        <Alert severity="error" sx={{ py: 0, fontSize: '11px', mb: 0.5 }}>
          {saveError}
        </Alert>
      )}

      <TextField
        size="small"
        fullWidth
        placeholder="ex. ZoomCI / 花束注文"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Button
                  size="small"
                  variant={hasPendingInput ? 'contained' : 'text'}
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={handleAdd}
                  disabled={disabled || !inputValue.trim()}
                  aria-label="todo を追加"
                  sx={{
                    minWidth: 58,
                    px: 0.75,
                    py: 0.25,
                    fontSize: '0.7rem',
                    lineHeight: 1,
                    textTransform: 'none',
                    '& .MuiButton-startIcon': { mr: 0.25 },
                  }}
                >
                  add
                </Button>
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
                  onClick={() => setDeleteTarget(todo)}
                  disabled={disabled}
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
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        aria-labelledby="daily-todo-delete-title"
      >
        <DialogTitle id="daily-todo-delete-title">Todoを削除しますか？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteTarget ? `「${deleteTarget.text}」を削除します。` : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>キャンセル</Button>
          <Button onClick={handleConfirmDelete} color="error" autoFocus>
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
