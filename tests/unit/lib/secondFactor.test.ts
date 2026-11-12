import { describe, it, expect } from 'vitest'
import { hasPhoneSecondFactor } from '@/lib/auth/secondFactor'

describe('hasPhoneSecondFactor', () => {
  it('SMS の2要素目を通ったトークンだけ true', () => {
    expect(hasPhoneSecondFactor({ firebase: { sign_in_second_factor: 'phone' } })).toBe(true)
  })
  it.each([
    ['firebase がない', {}],
    ['2要素目がない', { firebase: {} }],
    ['TOTP', { firebase: { sign_in_second_factor: 'totp' } }],
    ['大文字', { firebase: { sign_in_second_factor: 'PHONE' } }],
    ['文字列でない', { firebase: { sign_in_second_factor: true } }],
  ])('%s は false', (_label, decoded) => {
    expect(hasPhoneSecondFactor(decoded)).toBe(false)
  })
})
