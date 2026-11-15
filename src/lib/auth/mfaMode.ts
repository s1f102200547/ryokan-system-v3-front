import { MFA_MODES, type MfaMode } from '@/constants/auth'

// 環境変数 MFA_MODE を読む（src/constants/auth.ts の MFA_MODES）。未設定・想定外の値は all（全アカウントに SMS を求める。閉じる側）
export function parseMfaMode(value: string | undefined): MfaMode {
  const trimmed = value?.trim()
  return MFA_MODES.find((mode) => mode === trimmed) ?? 'all'
}

export function currentMfaMode(): MfaMode {
  return parseMfaMode(process.env.MFA_MODE)
}
