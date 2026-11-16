import { describe, it, expect } from 'vitest'
import { parseRecaptchaSiteKey } from '@/lib/auth/recaptchaSiteKey'

describe('parseRecaptchaSiteKey', () => {
  it('サイトキーの形なら返す（前後の空白は除く）', () => {
    expect(parseRecaptchaSiteKey('test-site-key-000000000000000000000000000')).toBe('test-site-key-000000000000000000000000000')
    expect(parseRecaptchaSiteKey(' test-site-key-000000000000000000000000000\n')).toBe('test-site-key-000000000000000000000000000')
  })
  it.each([
    ['未設定', undefined],
    ['空', ''],
    ['短すぎる', 'abc'],
    ['URL や script を混ぜた値', 'test-site-key-0000"><script>alert(1)</script>'],
  ])('%s は null（reCAPTCHA を使わない）', (_label, value) => {
    expect(parseRecaptchaSiteKey(value)).toBeNull()
  })
})
