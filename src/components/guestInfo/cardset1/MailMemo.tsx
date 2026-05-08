'use client'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import type { MailMemoEntry } from '@/types/guestInfo'
import type { BookingSite } from '@/types/guestInfo'

type Props = {
  bookingSite: BookingSite
  items: MailMemoEntry[]
  onChange: (items: MailMemoEntry[]) => void
}

function defaultSource(bookingSite: BookingSite): string {
  if (bookingSite === 'booking.com') return 'booking'
  if (bookingSite === 'expedia') return 'expedia'
  return 'webmail'
}

const tinyInput = {
  '& .MuiInputBase-input': { fontSize: '0.7rem', lineHeight: 1.1, color: 'grey.500', padding: 0 },
}

const tinyDateInput = {
  '& .MuiInputBase-input': {
    fontSize: '0.7rem',
    lineHeight: 1.1,
    color: 'grey.500',
    padding: 0,
    textAlign: 'center',
  },
}

export function MailMemo({ bookingSite, items, onChange }: Props) {
  const addItem = () => {
    const now = new Date()
    onChange([
      ...items,
      {
        month: String(now.getMonth() + 1),
        day: String(now.getDate()),
        name: '',
        summary: '',
        text: '',
        source: defaultSource(bookingSite),
      },
    ])
  }

  const removeItem = (idx: number) => {
    if (!window.confirm('この項目を削除しますか？')) return
    onChange(items.filter((_, i) => i !== idx))
  }

  const updateField = (idx: number, field: keyof MailMemoEntry, value: string) => {
    onChange(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', pl: 3 }}>
      {items.map((item, idx) => (
        <Box
          key={idx}
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            mb: idx === items.length - 1 ? 0 : 2,
            '&:hover .remove-btn': { opacity: 1, pointerEvents: 'auto' },
          }}
        >
          {/* タイムラインマーカー */}
          <Box sx={{ position: 'relative', width: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 2 }}>
            <Box sx={{ width: 25, height: 25, borderRadius: '50%', bgcolor: 'grey.300', mt: '2px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {idx === items.length - 1 && (
                <IconButton
                  className="remove-btn"
                  size="small"
                  onClick={() => removeItem(idx)}
                  sx={{ opacity: 0, pointerEvents: 'none', p: 0.4, width: 18, height: 18, transition: 'opacity 0.2s' }}
                >
                  <RemoveIcon fontSize="inherit" />
                </IconButton>
              )}
            </Box>
            {idx < items.length - 1 && (
              <Box sx={{ width: 1.5, height: 24, bgcolor: 'grey.400', mt: 1 }} />
            )}
          </Box>

          {/* 入力フィールド群 */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.5ch' }}>
            {/* 日付・source・名前 */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.15, mt: 0.5, mb: '0.5ch', pb: 0.3 }}>
              <TextField
                placeholder="MM" value={item.month}
                onChange={(e) => updateField(idx, 'month', e.target.value)}
                size="small" variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ width: '1.4ch', ...tinyDateInput }}
              />
              <Box sx={{ fontSize: '0.7rem', color: 'grey.500', lineHeight: 1.1, mx: 0 }}>/</Box>
              <TextField
                placeholder="DD" value={item.day}
                onChange={(e) => updateField(idx, 'day', e.target.value)}
                size="small" variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ width: '2ch', ...tinyDateInput }}
              />
              <TextField
                placeholder="source" value={item.source}
                onChange={(e) => updateField(idx, 'source', e.target.value)}
                size="small" variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ width: '6ch', ...tinyInput, ml: 0.5 }}
              />
              <TextField
                placeholder="Name" value={item.name}
                onChange={(e) => updateField(idx, 'name', e.target.value)}
                size="small" variant="standard"
                slotProps={{ input: { disableUnderline: true } }}
                sx={{ flex: 1, ...tinyInput }}
              />
            </Box>

            {/* サマリー */}
            <TextField
              placeholder="Summary" value={item.summary}
              onChange={(e) => updateField(idx, 'summary', e.target.value)}
              fullWidth variant="standard"
              slotProps={{ input: { disableUnderline: true } }}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.9rem', lineHeight: 1.1, color: '#202124', p: 0, mt: '-15px' } }}
            />

            {/* 本文 */}
            <TextField
              placeholder="Text" value={item.text}
              onChange={(e) => updateField(idx, 'text', e.target.value)}
              multiline minRows={1} maxRows={4} fullWidth variant="standard" size="small"
              slotProps={{ input: { disableUnderline: true } }}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', lineHeight: 1.1, whiteSpace: 'pre-wrap', pl: '5px', color: '#4d5156' } }}
            />
          </Box>
        </Box>
      ))}

      {/* 追加ボタン */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 1 }}>
        <Box sx={{ position: 'relative', width: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 2 }}>
          <IconButton
            size="small" onClick={addItem}
            sx={{ mt: '2px', p: 0.4, width: 18, height: 18, borderRadius: '50%', bgcolor: 'rgba(0,0,0,0.05)', transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s', '&:hover': { transform: 'scale(1.1)', boxShadow: 2, bgcolor: 'rgba(0,0,0,0.1)' } }}
          >
            <AddIcon fontSize="inherit" />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
