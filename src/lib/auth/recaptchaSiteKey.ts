// reCAPTCHA Enterprise のサイトキー（公開の値。ブラウザに渡す）。形が違えば使わない（設定の誤りで画面を壊さない。
// その場合 SMS の送信が 503 になり、Slack に MISSING_RECAPTCHA_TOKEN などが出る）
const SITE_KEY = /^[A-Za-z0-9_-]{20,100}$/

export function parseRecaptchaSiteKey(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && SITE_KEY.test(trimmed) ? trimmed : null
}
