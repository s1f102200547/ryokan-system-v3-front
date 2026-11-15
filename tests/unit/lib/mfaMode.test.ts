import { describe, it, expect } from 'vitest'
import { parseMfaMode } from '@/lib/auth/mfaMode'
import { MFA_MODES } from '@/constants/auth'

// 環境変数 MFA_MODE。打ち間違いや設定忘れで、スタッフを SMS なしで入れてしまわない（閉じる側の all に倒す）
describe('parseMfaMode', () => {
  it.each(MFA_MODES)('%s はそのまま', (mode) => {
    expect(parseMfaMode(mode)).toBe(mode)
  })

  it('前後の空白は無視する（GitHub の Variables に貼ったときの改行など）', () => {
    expect(parseMfaMode(' enrolled_only\n')).toBe('enrolled_only')
  })

  it.each([undefined, '', 'ENROLLED_ONLY', 'enrolled-only', 'none', 'off', 'false'])('%s は all', (value) => {
    expect(parseMfaMode(value)).toBe('all')
  })
})
