'use client'

import { useRef, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { sanitizeMfaCodeInput } from '@/lib/auth/mfaCodeInput'
import { MFA_CODE_LENGTH } from '@/constants/auth'

// SMS のコードの入力欄。見た目は MFA_CODE_LENGTH 個のマスで、中身は1つの <input>（貼り付け・Backspace・日本語入力・
// autocomplete="one-time-code"・スクリーンリーダーが、マスごとに input を分けるより確実に動く）。
// 全角の数字は半角に直し、それ以外の文字は入れずに理由を出す（src/lib/auth/mfaCodeInput.ts）。
// 桁がそろったら onComplete を1回呼ぶ（ボタンなしで送る）。打ち直して再びそろえば、また呼ぶ
type Props = {
  value: string
  onChange: (digits: string) => void
  onComplete: (digits: string) => void
  // 確認中: 入力を受け付けないが、フォーカスは保つ（失敗したらすぐ打ち直せる）
  readOnly: boolean
  // 止められている間: 触れない
  disabled: boolean
}

export const INVALID_MFA_CODE_CHAR_MESSAGE = '半角の数字（0〜9）で入力してください'

export function MfaCodeInput({ value, onChange, onComplete, readOnly, disabled }: Props) {
  // 日本語入力の変換の途中は、値を書き換えない（書き換えると Chrome の変換が壊れる）。確定（compositionend）で直す
  const composing = useRef(false)
  const [draft, setDraft] = useState<string | null>(null) // 変換の途中の文字（そのまま input に出す）
  const [rejected, setRejected] = useState(false)
  const [focused, setFocused] = useState(false)

  const commit = (raw: string) => {
    const { digits, rejected: hasInvalid } = sanitizeMfaCodeInput(raw)
    setDraft(null)
    setRejected(hasInvalid)
    if (digits === value) return
    onChange(digits)
    if (digits.length === MFA_CODE_LENGTH) onComplete(digits)
  }

  const shown = draft ?? value
  // 変換の途中も、マスには数字として読めるところまでを出す
  const cells = draft === null ? value : sanitizeMfaCodeInput(draft).digits
  const active = Math.min(cells.length, MFA_CODE_LENGTH - 1)

  return (
    <Box>
      <Box sx={{ position: 'relative', display: 'flex', gap: 1, justifyContent: 'center' }}>
        {Array.from({ length: MFA_CODE_LENGTH }, (_, i) => {
          const isActive = focused && !disabled && !readOnly && i === active && cells.length < MFA_CODE_LENGTH
          return (
            <Box
              key={i}
              data-testid="mfa-code-cell"
              aria-hidden
              sx={{
                width: 42, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 2, borderRadius: 1, fontSize: 24, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                borderColor: rejected ? 'error.main' : isActive ? 'primary.main' : 'divider',
                color: disabled ? 'text.disabled' : 'text.primary',
                bgcolor: disabled ? 'action.disabledBackground' : 'background.paper',
                transition: 'border-color 120ms',
              }}
            >
              {cells[i] ?? (isActive && (
                <Box
                  component="span"
                  sx={{
                    width: 2, height: 26, bgcolor: 'primary.main',
                    animation: 'mfaCaretBlink 1s step-end infinite',
                    '@keyframes mfaCaretBlink': { '50%': { opacity: 0 } },
                  }}
                />
              ))}
            </Box>
          )
        })}
        {/* 本物の入力欄。マスの上に透明に重ね、どこを押してもここに入る。カーソルは末尾だけ（マスの間を行き来しない） */}
        <Box
          component="input"
          id="code"
          aria-label="確認コード"
          aria-describedby={rejected ? 'code-invalid' : undefined}
          aria-invalid={rejected || undefined}
          value={shown}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          readOnly={readOnly}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={(e: React.CompositionEvent<HTMLInputElement>) => {
            composing.current = false
            commit(e.currentTarget.value)
          }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            if (composing.current) setDraft(e.target.value)
            else commit(e.target.value)
          }}
          // カーソルを常に末尾へ（途中のマスを選んで書き換える操作は持たない。Backspace で後ろから消す）
          onSelect={(e: React.SyntheticEvent<HTMLInputElement>) => {
            const input = e.currentTarget
            const end = input.value.length
            if (!composing.current && (input.selectionStart !== end || input.selectionEnd !== end)) input.setSelectionRange(end, end)
          }}
          sx={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0,
            border: 0, p: 0, m: 0, cursor: disabled ? 'default' : 'text', fontSize: 16,
          }}
        />
      </Box>
      <Typography
        id="code-invalid"
        role="status"
        aria-live="polite"
        variant="body2"
        color="error"
        sx={{ mt: 1, minHeight: '1.5em', textAlign: 'center' }}
      >
        {rejected ? INVALID_MFA_CODE_CHAR_MESSAGE : ''}
      </Typography>
    </Box>
  )
}
