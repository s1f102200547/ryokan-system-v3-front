import { describe, it, expect } from 'vitest'
import { parseRecaptchaSiteKey } from '@/lib/auth/recaptchaSiteKey'

describe('parseRecaptchaSiteKey', () => {
  it('サイトキーの形なら返す（前後の空白は除く）', () => {
    expect(parseRecaptchaSiteKey('6Ldi8xwuAAAAAOPV8MlkljionzTDwYq2eke07CUF')).toBe('6Ldi8xwuAAAAAOPV8MlkljionzTDwYq2eke07CUF')
    expect(parseRecaptchaSiteKey(' 6Ldi8xwuAAAAAOPV8MlkljionzTDwYq2eke07CUF\n')).toBe('6Ldi8xwuAAAAAOPV8MlkljionzTDwYq2eke07CUF')
  })
  it.each([
    ['未設定', undefined],
    ['空', ''],
    ['短すぎる', 'abc'],
    ['URL や script を混ぜた値', '6Ldi8xwuAAAA"><script>alert(1)</script>'],
  ])('%s は null（reCAPTCHA を使わない）', (_label, value) => {
    expect(parseRecaptchaSiteKey(value)).toBeNull()
  })
})
