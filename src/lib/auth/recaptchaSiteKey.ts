import { RECAPTCHA_SITE_KEY_PATTERN } from '@/constants/auth'

// reCAPTCHA Enterprise のサイトキー（公開の値。ブラウザに渡す）。形が違えば使わない（設定の誤りで画面を壊さない。
// その場合 SMS の送信が 503 になり、Slack に MISSING_RECAPTCHA_TOKEN などが出る）。
// 本番は、未設定・形の違いをデプロイの前に止める（.github/workflows/deploy.yml）
const SITE_KEY = new RegExp(RECAPTCHA_SITE_KEY_PATTERN)

export function parseRecaptchaSiteKey(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && SITE_KEY.test(trimmed) ? trimmed : null
}
