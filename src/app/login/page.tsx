'use client'

import { useState } from 'react'
import { Box, TextField, Button, Alert, Typography, Paper } from '@mui/material'
import { useLogin } from '@/hooks/auth/useLogin'
import {
  LOGIN_EMAIL_MAX_LENGTH, LOGIN_EMAIL_MIN_LENGTH, LOGIN_PASSWORD_MAX_LENGTH, LOGIN_PASSWORD_MIN_LENGTH, MFA_CODE_LENGTH,
} from '@/constants/auth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const { step, phoneHint, login, verify, resend, back, isPending, isLocked, error, notice } = useLogin()

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setCode('')
    await login({ email, password })
  }

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault()
    await verify(code)
  }

  const handleResend = async () => {
    setCode('')
    await resend()
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Paper elevation={3} sx={{ p: 4, width: 360 }}>
        <Typography variant="h5" sx={{ mb: 3 }}>ログイン</Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {notice && !error && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}

        {step === 'credentials' ? (
          <Box component="form" onSubmit={handleCredentials} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              id="email"
              label="メールアドレス"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              // API の Zod と同じ値（src/constants/auth.ts）
              slotProps={{ htmlInput: { minLength: LOGIN_EMAIL_MIN_LENGTH, maxLength: LOGIN_EMAIL_MAX_LENGTH } }}
            />
            <TextField
              id="password"
              label="パスワード"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              slotProps={{ htmlInput: { minLength: LOGIN_PASSWORD_MIN_LENGTH, maxLength: LOGIN_PASSWORD_MAX_LENGTH } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={isPending || isLocked} // 失敗が続いて止められている間は押せない（入力欄は触れる）
              fullWidth
            >
              {isPending ? 'ログイン中…' : 'ログイン'}
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleCode} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2">
              {phoneHint ? `${phoneHint} に` : 'フロントの電話に'}SMS で送った {MFA_CODE_LENGTH} 桁のコードを入力してください
            </Typography>
            <TextField
              id="code"
              label="確認コード"
              value={code}
              // 半角数字だけを残す（API の Zod と同じ規則。src/lib/api/loginSchema.ts）
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, MFA_CODE_LENGTH))}
              required
              fullWidth
              autoFocus
              autoComplete="one-time-code"
              slotProps={{
                htmlInput: { inputMode: 'numeric', pattern: `[0-9]{${MFA_CODE_LENGTH}}`, minLength: MFA_CODE_LENGTH, maxLength: MFA_CODE_LENGTH },
              }}
            />
            <Button type="submit" variant="contained" disabled={isPending || isLocked} fullWidth>
              {isPending ? '確認中…' : '確認'}
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button type="button" onClick={back} disabled={isPending}>
                戻る
              </Button>
              <Button type="button" onClick={handleResend} disabled={isPending || isLocked}>
                コードを再送
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  )
}

export default LoginPage
