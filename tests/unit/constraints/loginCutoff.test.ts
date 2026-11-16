import { describe, it, expect } from 'vitest'
import { MFA_PENDING_TTL_MS } from '@/constants/auth'
import { LOGIN_CUTOFF_MINUTES_BEFORE_CLOSE } from '@/constants/date'

// [F-10] 22:55（終了の LOGIN_CUTOFF_MINUTES_BEFORE_CLOSE 分前）より前に送った SMS の途中の状態は、23:00 までに期限が来る。
// 片方だけ変えると、23:00 を過ぎてもコードを待つ途中の状態が残り、23:00 の後のコードが断られて SMS を無駄にする
describe('ログインの締め切りと、SMS の途中の状態の期限', () => {
  it('締め切り（終了の何分前）は、途中の状態の期限より短くない', () => {
    expect(LOGIN_CUTOFF_MINUTES_BEFORE_CLOSE * 60_000).toBeGreaterThanOrEqual(MFA_PENDING_TTL_MS)
  })
})
