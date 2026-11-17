import { describe, it, expect } from 'vitest'
import { acquireAttempt, checkThrottle, completeAttempt, type ThrottleState } from '@/domain/auth/loginThrottle'
import { LOGIN_LOCK_STEPS, MFA_CODE_LENGTH, MFA_PENDING_TTL_MS, MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

// パスワードを知る者が、SMS のコードを当てずっぽうで試せる回数の上限（docs/MfaBugHunt.md の S12）。
// 回数の制限（domain/auth/loginThrottle.ts）を、止められている時間が明けた瞬間に試し続ける攻撃者で24時間まわす。
// メールアドレスと IP は同じ表で数えるので、1つの key で数える（IP を変えても、メールアドレスの key で止まる）

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function maxWrongCodesPerDay(): number {
  let state: ThrottleState | null = null
  let now = 0
  let tries = 0
  while (now < DAY) {
    const locked = checkThrottle(state, now)
    if (!locked.success) { now += locked.error.retryAfterMs; continue }
    const acquired = acquireAttempt(state, now, `t${tries}`)
    if (!acquired.success) throw new Error('札が出ない（同時の試行はしていない）')
    state = completeAttempt(acquired.value, `t${tries}`, 'failure', now).next
    tries++
    now += 1 // 次の試行まで 1ms（実際は通信で数百 ms かかる）
  }
  return tries
}

describe('コードを当てずっぽうで試せる回数', () => {
  const perDay = maxWrongCodesPerDay()

  it('1日に試せるのは、止める段の表から決まる回数まで（2回 + 段ごとに1回 + 以後1時間に1回）', () => {
    // 3回目で1分、4回目で5分、5回目で15分、6回目以降は1時間ずつ止める。24時間で試せる回数
    const lastStep = LOGIN_LOCK_STEPS[LOGIN_LOCK_STEPS.length - 1]
    const beforeHourly = LOGIN_LOCK_STEPS.slice(0, -1).reduce((ms, s) => ms + s.lockMs, 0)
    const expected = lastStep.failures + Math.floor((DAY - beforeHourly - 1) / lastStep.lockMs)
    expect(perDay).toBe(expected)
    expect(perDay).toBeLessThanOrEqual(30)
  })

  it('1日に当たる確率は、10万分の3より小さい（6桁のコード、毎回別のコードを試しても）', () => {
    expect(perDay / 10 ** MFA_CODE_LENGTH).toBeLessThan(3e-5)
  })

  // コードは SMS ごとに変わり、途中の状態は5分で切れる。1日の SMS は10通まで。
  // 1通の SMS のコードに試せる回数は、その5分の間に止められずに試せる回数まで
  it('1通の SMS のコード（5分）に試せるのは、止める前の数回だけ', () => {
    let state: ThrottleState | null = null
    let now = 0
    let tries = 0
    while (now < MFA_PENDING_TTL_MS) {
      const locked = checkThrottle(state, now)
      if (!locked.success) { now += locked.error.retryAfterMs; continue }
      const acquired = acquireAttempt(state, now, `t${tries}`)
      if (!acquired.success) break
      state = completeAttempt(acquired.value, `t${tries}`, 'failure', now).next
      tries++
      now += 1
    }
    expect(tries).toBe(4) // 2回 + 3回目（1分止める）+ 4回目（5分止める。ここで5分を過ぎる）
    expect(tries * MFA_SMS_DAILY_LIMIT).toBeGreaterThanOrEqual(perDay) // SMS の上限より、回数の制限が先に効く
  })
})
