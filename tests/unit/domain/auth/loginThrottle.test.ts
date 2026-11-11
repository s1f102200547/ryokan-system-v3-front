import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { acquireAttempt, checkThrottle, lockDurationMs, recordFailure, refundFailure, type ThrottleState } from '@/domain/auth/loginThrottle'
import { LOGIN_FAILURE_RESET_MS } from '@/constants/auth'

const MIN = 60 * 1000
const NOW = Date.parse('2026-05-20T03:00:00Z')

// n 回続けて失敗した状態（間隔は1秒）
function failTimes(n: number, startMs = NOW): { state: ThrottleState | null; lastLockMs: number | null } {
  let state: ThrottleState | null = null
  let lastLockMs: number | null = null
  for (let i = 0; i < n; i++) {
    const r = recordFailure(state, startMs + i * 1000)
    state = r.next
    lastLockMs = r.lockMs
  }
  return { state, lastLockMs }
}

describe('lockDurationMs（iPhone 方式の表）', () => {
  it.each([
    [0, null], [1, null], [2, null],
    [3, 1 * MIN], [4, 5 * MIN], [5, 15 * MIN], [6, 60 * MIN], [7, 60 * MIN], [100, 60 * MIN],
  ])('%i 回 → %s', (failures, expected) => {
    expect(lockDurationMs(failures)).toBe(expected)
  })
})

describe('recordFailure', () => {
  it('2回までは止めない', () => {
    const { state, lastLockMs } = failTimes(2)
    expect(lastLockMs).toBeNull()
    expect(checkThrottle(state, NOW + 2000).success).toBe(true)
  })

  it('3回目で1分止め、止め始めたことを返す', () => {
    const { state, lastLockMs } = failTimes(3)
    const at = NOW + 2000
    expect(lastLockMs).toBe(1 * MIN)
    expect(state).toEqual({ failures: 3, lastFailureAtMs: at, lockedUntilMs: at + 1 * MIN })
  })

  it('最後の失敗から24時間たっていれば1から数える', () => {
    const { state } = failTimes(5)
    const r = recordFailure(state, NOW + LOGIN_FAILURE_RESET_MS + 10_000)
    expect(r.next.failures).toBe(1)
    expect(r.lockMs).toBeNull()
  })

  it('24時間の手前なら数え続ける', () => {
    const { state } = failTimes(2)
    const r = recordFailure(state, NOW + 1000 + LOGIN_FAILURE_RESET_MS - 1)
    expect(r.next.failures).toBe(3)
  })
})

describe('checkThrottle', () => {
  it('記録がなければ通す', () => {
    expect(checkThrottle(null, NOW)).toEqual({ success: true, value: undefined })
  })

  it('止めている間は残りの時間、切れたら通す', () => {
    const { state } = failTimes(3)
    const until = NOW + 2000 + 1 * MIN
    expect(checkThrottle(state, until - 1500)).toEqual({ success: false, error: { retryAfterMs: 1500 } })
    expect(checkThrottle(state, until).success).toBe(true)
  })
})

describe('性質', () => {
  const failures = fc.integer({ min: 1, max: 30 })

  it('失敗が増えても、止める時間は短くならない', () => {
    fc.assert(fc.property(failures, (n) => (lockDurationMs(n + 1) ?? 0) >= (lockDurationMs(n) ?? 0)))
  })

  it('止めている間の残りの時間は 0 より大きく、1時間以下', () => {
    fc.assert(fc.property(failures, fc.integer({ min: 0, max: 2 * 60 * MIN }), (n, elapsed) => {
      const { state } = failTimes(n)
      const r = checkThrottle(state, NOW + (n - 1) * 1000 + elapsed)
      return r.success || (r.error.retryAfterMs > 0 && r.error.retryAfterMs <= 60 * MIN)
    }))
  })

  it('回数が負の壊れた記録でも、次の回数は 1 から', () => {
    expect(recordFailure({ failures: -5, lastFailureAtMs: NOW, lockedUntilMs: 0 }, NOW + 1000).next.failures).toBe(1)
  })

  it('壊れた記録（未来の失敗の時刻など）でも例外を投げない', () => {
    const state = fc.record({ failures: fc.integer({ min: -5, max: 1000 }), lastFailureAtMs: fc.integer(), lockedUntilMs: fc.integer() })
    fc.assert(fc.property(state, fc.integer({ min: 0, max: 2 ** 45 }), (s, now) => {
      checkThrottle(s, now)
      const { next } = recordFailure(s, now)
      return next.failures >= 1
    }))
  })
})

describe('acquireAttempt と refundFailure（先に数えて、障害なら返す）', () => {
  it('止まっていれば数えずに retryAfterMs', () => {
    const { state } = failTimes(3)
    expect(acquireAttempt(state, NOW + 2000 + 10_000)).toEqual({ success: false, error: { retryAfterMs: 50_000 } })
  })

  it('間にほかの試行がなければ、先に数える前の状態にそのまま戻す（止める時間を今から数え直さない）', () => {
    const { state: before } = failTimes(3) // 1分止まる
    const at = NOW + 2000 + MIN // 止まりが切れた時刻
    const acquired = acquireAttempt(before, at)
    if (!acquired.success) throw new Error('通るはず')
    expect(acquired.value.lockMs).toBe(5 * MIN) // 先に数えると4回目で5分止まる
    expect(refundFailure(acquired.value.next, before, at)).toEqual(before)
    expect(checkThrottle(refundFailure(acquired.value.next, before, at), at).success).toBe(true)
  })

  it('記録がなかったときは、返すと記録ごと消える', () => {
    const acquired = acquireAttempt(null, NOW)
    if (!acquired.success) throw new Error('通るはず')
    expect(refundFailure(acquired.value.next, null, NOW)).toBeNull()
  })

  it('間にほかの試行が割り込んでいたら、回数だけ1つ減らす', () => {
    const first = acquireAttempt(null, NOW)
    if (!first.success) throw new Error('通るはず')
    const second = acquireAttempt(first.value.next, NOW + 10) // 割り込んだ試行
    if (!second.success) throw new Error('通るはず')
    // 1つ目が障害だったので返す。今の状態は2つ目が書いたもの
    expect(refundFailure(second.value.next, null, NOW)).toEqual({ failures: 1, lastFailureAtMs: NOW + 10, lockedUntilMs: 0 })
  })
})

