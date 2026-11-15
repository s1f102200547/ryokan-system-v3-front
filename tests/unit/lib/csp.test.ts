import { describe, it, expect } from 'vitest'
import { buildCsp } from '@/lib/csp'

// production の CSP 文字列（変えてはいけない基準値）。
// ブラウザは Firebase を呼ばない（パスワードの確認はサーバーが行う）ので、connect-src は自分の API だけ
const PRODUCTION_CSP = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-abc' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self'`,
  `font-src 'self'`,
  `connect-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ')

describe('buildCsp', () => {
  it('production は基準値と一致する', () => {
    expect(buildCsp({ nonce: 'abc', isDev: false })).toBe(PRODUCTION_CSP)
  })

  it('development では unsafe-eval を許可する', () => {
    const csp = buildCsp({ nonce: 'abc', isDev: true })
    expect(csp).toContain(`script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'`)
  })

  it('development でも connect-src は自分の API だけ（Auth Emulator にもブラウザからはつながない）', () => {
    expect(buildCsp({ nonce: 'abc', isDev: true })).toContain(`connect-src 'self';`)
  })

  // ログイン画面だけ: SMS の送信に Identity Platform が求める reCAPTCHA Enterprise（Google の iframe と通信）を許す
  it('ログイン画面（recaptcha）は、基準値に reCAPTCHA の frame-src と connect-src だけを足す', () => {
    expect(buildCsp({ nonce: 'abc', isDev: false, recaptcha: true })).toBe([
      `default-src 'self'`,
      `script-src 'self' 'nonce-abc' 'strict-dynamic'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self'`,
      `font-src 'self'`,
      `connect-src 'self' https://www.google.com/recaptcha/`,
      `frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; '))
  })

  it('既定（ログイン画面以外）は reCAPTCHA を許さない', () => {
    expect(buildCsp({ nonce: 'abc', isDev: false })).not.toContain('google')
  })
})
