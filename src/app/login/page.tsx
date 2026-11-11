'use client'

import { useState } from 'react'
import { Box, TextField, Button, Alert, Typography, Paper } from '@mui/material'
import { useLogin } from '@/hooks/auth/useLogin'
import { LOGIN_EMAIL_MAX_LENGTH, LOGIN_EMAIL_MIN_LENGTH, LOGIN_PASSWORD_MAX_LENGTH, LOGIN_PASSWORD_MIN_LENGTH } from '@/constants/auth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { login, isPending, isLocked, error } = useLogin()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login({ email, password })
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

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            id="email"
            label="メールアドレス"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            disabled={isLocked} // 失敗が続いて止められている間は入力させない
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
            disabled={isLocked} // 失敗が続いて止められている間は入力させない
            slotProps={{ htmlInput: { minLength: LOGIN_PASSWORD_MIN_LENGTH, maxLength: LOGIN_PASSWORD_MAX_LENGTH } }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={isPending || isLocked}
            fullWidth
          >
            {isPending ? 'ログイン中…' : 'ログイン'}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}

export default LoginPage
