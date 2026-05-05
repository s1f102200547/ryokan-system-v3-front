import React, { useState } from 'react';
import { Box, TextField, IconButton, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';

/**
 * MailMemo コンポーネント
 * - booking_site に応じて source の初期値を設定
 * - addItem, removeItem, handleFieldChange でエラーハンドリング
 */
export default function MailMemo({
  booking_site,
  items = [],
  onChange,
}) {
  // エラー状態
  const [error, setError] = useState(null);

  // 項目の追加
const addItem = () => {
  try {
    const now = new Date();
    const site = (booking_site || '').toLowerCase();
    const initialSource =
      site === 'booking.com'
        ? 'booking'
        : site === 'expedia'
          ? 'expedia'
          : 'webmail';

    onChange([
      ...items,
      {
        month: String(now.getMonth() + 1),
        day: String(now.getDate()),
        name: '',
        summary: '',
        text: '',
        source: initialSource,
      },
    ]);
    setError(null);
  } catch (e) {
    console.error(e);
    setError('アイテムの追加中にエラーが発生しました: ' + e.message);
  }
};


  // 項目の削除（confirm付き）
  const tryRemoveItem = (idx) => {
    if (!window.confirm('この項目を本当に削除しますか？')) {
      return;
    }
    try {
      onChange(items.filter((_, i) => i !== idx));
      setError(null);
    } catch (e) {
      console.error(e);
      setError('アイテムの削除中にエラーが発生しました: ' + e.message);
    }
  };

  // フィールド更新
  const handleFieldChange = (idx, field, value) => {
    try {
      const newItems = items.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      );

      onChange(newItems);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('フィールド更新中にエラーが発生しました: ' + e.message);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', pl: 3 }}>
      {/* エラー表示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {items.map((item, idx) => (
        <Box
          key={idx}
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            mb: idx === items.length - 1 ? 0 : 2,
            '&:hover .remove-btn': {
              opacity: 1,
              pointerEvents: 'auto',
            },
          }}
        >
          {/* マーカー＋マイナスボタン */}
          <Box
            sx={{
              position: 'relative',
              width: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              mr: 2,
            }}
          >
            <Box
              sx={{
                width: 25,
                height: 25,
                borderRadius: '50%',
                bgcolor: 'grey.300',
                mt: '2px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {idx === items.length - 1 && (
                <IconButton
                  className="remove-btn"
                  size="small"
                  onClick={() => tryRemoveItem(idx)}
                  sx={{
                    opacity: 0,
                    pointerEvents: 'none',
                    p: 0.4,
                    width: 18,
                    height: 18,
                    bgcolor: 'transparent',
                    transition: 'opacity 0.2s',
                    '&:hover': {
                      bgcolor: 'rgba(0,0,0,0.08)',
                    },
                  }}
                >
                  <RemoveIcon fontSize="inherit" />
                </IconButton>
              )}
            </Box>

            {/* 下方向に出る細い線 */}
            {idx < items.length - 1 && (
              <Box
                sx={{
                  width: 2,           // 線の太さ
                  height: 24,         // 線の長さ（px単位で調整可）
                  bgcolor: 'grey.400',
                  mt: 1,              // 円と線との間隔
                }}
              />
            )}
          </Box>

          {/* 入力フィールド群 */}
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5ch',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0, mb: '0.5ch' }}>
              <TextField
                placeholder="MM"
                value={item.month}
                onChange={(e) => handleFieldChange(idx, 'month', e.target.value)}
                size="small"
                variant="standard"
                InputProps={{ disableUnderline: true }}
                sx={{
                  width: '1.8ch',
                  '& .MuiInputBase-input': {
                    fontSize: '0.7rem',
                    lineHeight: 1.1,
                    color: 'grey.500',
                    textAlign: 'center',
                    padding: 0,
                  },
                }}
              />
              <Box sx={{ fontSize: '0.7rem', color: 'grey.500', lineHeight: 1.1 }}>/</Box>
              <TextField
                placeholder="DD"
                value={item.day}
                onChange={(e) => handleFieldChange(idx, 'day', e.target.value)}
                size="small"
                variant="standard"
                InputProps={{ disableUnderline: true }}
                sx={{
                  width: '1.8ch',
                  '& .MuiInputBase-input': {
                    fontSize: '0.7rem',
                    lineHeight: 1.1,
                    color: 'grey.500',
                    textAlign: 'center',
                    padding: 0,
                  },
                }}
              />
              <TextField
                placeholder="source"
                value={item.source}
                onChange={(e) => handleFieldChange(idx, 'source', e.target.value)}
                size="small"
                variant="standard"
                InputProps={{ disableUnderline: true }}
                sx={{
                  ml: 1,
                  '& .MuiInputBase-input': {
                    fontSize: '0.7rem',
                    lineHeight: 1.1,
                    color: 'grey.500',
                  },
                }}
              />
              <TextField
                placeholder="Name"
                value={item.name}
                onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                size="small"
                variant="standard"
                InputProps={{
                  disableUnderline: true,
                  sx: {
                    ml: -10,
                    // 通常の入力文字色
                    '& .MuiInputBase-input': {
                      fontSize: '0.7rem',
                      lineHeight: 1.1,
                      color: 'grey.500',
                    },
                    // placeholder の色を同じに
                    '& .MuiInputBase-input::placeholder': {
                      color: 'grey.500',
                      opacity: 1, // ブラウザによってはデフォルトで透過がかかっているのでリセット
                    },
                  },
                }}
            />

            </Box>
            <TextField
              placeholder="Summary"
              value={item.summary}
              onChange={(e) => handleFieldChange(idx, 'summary', e.target.value)}
              fullWidth
              variant="standard"
              InputProps={{ disableUnderline: true }}
              sx={{
                '& .MuiInputBase-input': {
                  fontSize: '0.9rem',
                  lineHeight: 1.1,
                  color: '#202124',
                  p: 0,
                  mt: '-15px',
                },
              }}
            />
            <TextField
              placeholder="Text"
              value={item.text}
              onChange={(e) => handleFieldChange(idx, 'text', e.target.value)}
              multiline
              minRows={1}
              maxRows={4}
              fullWidth
              variant="standard"
              size="small"
              InputProps={{ disableUnderline: true }}
              sx={{
                '& .MuiInputBase-input': {
                  fontSize: '0.75rem',
                  lineHeight: 1.1,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'break-word',
                  pl: '5px',
                  color: '#4d5156',
                },
              }}
            />
          </Box>
        </Box>
      ))}

      {/* 追加アイコン */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 1 }}>
        <Box
          sx={{
            position: 'relative',
            width: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mr: 2,
          }}
        >
          <IconButton
            size="small"
            onClick={addItem}
            sx={{
              mt: '2px',
              p: 0.4,
              width: 18,
              height: 18,
              borderRadius: '50%',
              bgcolor: 'rgba(0,0,0,0.05)',
              transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
              '&:hover': {
                transform: 'scale(1.1)',
                boxShadow: 2,
                bgcolor: 'rgba(0,0,0,0.1)',
              },
            }}
          >
            <AddIcon fontSize="inherit" />
          </IconButton>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
      </Box>
    </Box>
  );
}
