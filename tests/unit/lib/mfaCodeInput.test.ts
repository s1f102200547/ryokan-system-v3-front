import { describe, it, expect } from 'vitest'
import { sanitizeMfaCodeInput } from '@/lib/auth/mfaCodeInput'
import { MfaVerifyBodySchema } from '@/lib/api/loginSchema'

// SMS のコードの入力。全角の数字・貼り付けの区切りは黙って直し、それ以外の文字は捨てて知らせる

describe('sanitizeMfaCodeInput', () => {
  it.each([
    ['123456', '123456'],
    ['１２３４５６', '123456'], // 日本語入力がオンのまま打った
    ['123 456', '123456'], // SMS からの貼り付け
    ['123-456', '123456'],
    ['１２３－４５６', '123456'], // 全角のハイフン
    ['123　456', '123456'], // 全角の空白
    [' 123456\n', '123456'],
    ['123ー456', '123456'], // 長音
  ])('%j は %j（理由は出さない）', (raw, digits) => {
    expect(sanitizeMfaCodeInput(raw)).toEqual({ digits, rejected: false })
  })

  it.each([
    ['12a3', '123'],
    ['ａ１', '1'],
    ['あ', ''],
    ['12.3', '123'],
    ['+1', '1'],
  ])('%j は数字だけ残し、理由を出す（%j）', (raw, digits) => {
    expect(sanitizeMfaCodeInput(raw)).toEqual({ digits, rejected: true })
  })

  it('桁数を超えた分は捨てる（理由は出さない）', () => {
    expect(sanitizeMfaCodeInput('1234567890')).toEqual({ digits: '123456', rejected: false })
  })

  it('空なら空', () => {
    expect(sanitizeMfaCodeInput('')).toEqual({ digits: '', rejected: false })
  })

  // 画面が送る形は、サーバーの確認（Zod）がそのまま受け付ける形
  it('6桁にそろった結果は、verify API の Zod を通る', () => {
    for (const raw of ['１２３４５６', '123 456', '12-34-56']) {
      expect(MfaVerifyBodySchema.safeParse({ code: sanitizeMfaCodeInput(raw).digits }).success).toBe(true)
    }
  })
})
