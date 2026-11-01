import { describe, it, expect } from 'vitest'
import { buildCsp } from '@/lib/csp'

// production の CSP 文字列（変えてはいけない基準値）
const PRODUCTION_CSP = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-abc' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self'`,
  `font-src 'self'`,
  `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ')

describe('buildCsp', () => {
  it('production では Emulator のアドレスを含めず、基準値と一致する', () => {
    const csp = buildCsp({ nonce: 'abc', isDev: false, authEmulatorHost: '127.0.0.1:9099' })
    expect(csp).toBe(PRODUCTION_CSP)
    expect(csp).not.toContain('127.0.0.1')
  })

  it('development では connect-src に Auth Emulator のアドレスを加える', () => {
    const csp = buildCsp({ nonce: 'abc', isDev: true, authEmulatorHost: '127.0.0.1:9099' })
    expect(csp).toContain(
      `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com http://127.0.0.1:9099`,
    )
  })

  it('development では unsafe-eval を許可する', () => {
    const csp = buildCsp({ nonce: 'abc', isDev: true, authEmulatorHost: undefined })
    expect(csp).toContain(`script-src 'self' 'nonce-abc' 'strict-dynamic' 'unsafe-eval'`)
  })

  it('development でも接続先が未設定なら Emulator のアドレスを加えない', () => {
    const csp = buildCsp({ nonce: 'abc', isDev: true, authEmulatorHost: undefined })
    expect(csp).toContain(
      `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;`,
    )
  })
})
