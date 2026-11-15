'use client'

import { useMemo, useState } from 'react'
import { Box, TextField, Button, Alert, Typography, Paper, CircularProgress } from '@mui/material'
import { formatWait, useLogin } from '@/hooks/auth/useLogin'
import { createRecaptchaTokenGetter } from '@/hooks/auth/recaptchaEnterprise'
import { MfaCodeInput } from '@/components/auth/MfaCodeInput'
import {
  LOGIN_EMAIL_MAX_LENGTH, LOGIN_EMAIL_MIN_LENGTH, LOGIN_PASSWORD_MAX_LENGTH, LOGIN_PASSWORD_MIN_LENGTH, MFA_CODE_LENGTH,
} from '@/constants/auth'

// recaptchaSiteKey: reCAPTCHA Enterprise のサイトキー（src/app/login/page.tsx がサーバーの環境変数から渡す）。null なら使わない
export function LoginForm({ recaptchaSiteKey }: { recaptchaSiteKey: string | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const getRecaptchaToken = useMemo(() => (recaptchaSiteKey ? createRecaptchaTokenGetter(recaptchaSiteKey) : undefined), [recaptchaSiteKey])
  const { step, phoneHint, login, verify, resend, back, isPending, isLocked, error, notice, resendWaitSeconds } = useLogin({ getRecaptchaToken })

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setCode('')
    await login({ email, password })
  }

  // 6桁そろったら送る（ボタンなし）。合わなければマスを空にして、すぐ打ち直せるようにする（メッセージは useLogin が出す）
  const submitCode = async (digits: string) => {
    if (!(await verify(digits))) setCode('')
  }

  // Enter でも送れる（6桁そろっていれば。そろった時点で自動で送っているので、主に送り直し用）
  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length === MFA_CODE_LENGTH) await submitCode(code)
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
            <MfaCodeInput value={code} onChange={setCode} onComplete={submitCode} readOnly={isPending} disabled={isLocked} />
            {/* 確認中の表示。出たり消えたりしても下のボタンが動かないよう、場所は常に取っておく */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 24 }}>
              {isPending && (
                <>
                  <CircularProgress size={18} aria-hidden />
                  <Typography variant="body2">確認中…</Typography>
                </>
              )}
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button type="button" onClick={back} disabled={isPending}>
                戻る
              </Button>
              {/* SMS を送ってから30秒は押せない（続けて押されて1日の上限を使い切らないため。src/constants/auth.ts） */}
              <Button type="button" onClick={handleResend} disabled={isPending || isLocked || resendWaitSeconds > 0}>
                {resendWaitSeconds > 0 ? `コードを再送（あと ${formatWait(resendWaitSeconds * 1000)}）` : 'コードを再送'}
              </Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  )
}
