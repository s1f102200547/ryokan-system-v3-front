import { z } from 'zod'
import {
  LOGIN_EMAIL_MAX_LENGTH, LOGIN_EMAIL_MIN_LENGTH, LOGIN_PASSWORD_MAX_LENGTH, LOGIN_PASSWORD_MIN_LENGTH, MFA_CODE_LENGTH,
} from '@/constants/auth'

// ログイン API の body。パスワードはこのサーバーを通る（ブラウザから Firebase を呼ばない）。body はログに出さない。
// メールアドレスの形式は、ログイン画面の <input type="email"> と同じ規則（画面で通るのにここで断られる、をなくす）。
// e2e/login.spec.ts がブラウザの判定と突き合わせている
export const LoginBodySchema = z.object({
  email: z.email({ pattern: z.regexes.html5Email }).min(LOGIN_EMAIL_MIN_LENGTH).max(LOGIN_EMAIL_MAX_LENGTH),
  password: z.string().min(LOGIN_PASSWORD_MIN_LENGTH).max(LOGIN_PASSWORD_MAX_LENGTH),
})

// SMS のコードの確認 API（/api/auth/login/verify）の body。半角数字 MFA_CODE_LENGTH 桁だけ（ログイン画面の入力欄と同じ値）
export const MfaVerifyBodySchema = z.object({
  code: z.string().regex(new RegExp(`^[0-9]{${MFA_CODE_LENGTH}}$`)),
})
