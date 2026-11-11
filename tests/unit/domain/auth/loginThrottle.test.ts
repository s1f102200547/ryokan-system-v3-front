import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  acquireAll, acquireAttempt, checkThrottle, completeAttempt, lockDurationMs, recordFailure, remainingBeforeLock, type ThrottleState,
} from '@/domain/auth/loginThrottle'
import { LOGIN_PENDING_TTL_MS } from '@/constants/auth'
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
    expect(state).toEqual({ failures: 3, lastFailureAtMs: at, lockedUntilMs: at + 1 * MIN, pending: [] })
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
    expect(recordFailure({ failures: -5, lastFailureAtMs: NOW, lockedUntilMs: 0, pending: [] }, NOW + 1000).next.failures).toBe(1)
  })

  it('壊れた記録（未来の失敗の時刻など）でも例外を投げない', () => {
    const state = fc.record({ failures: fc.integer({ min: -5, max: 1000 }), lastFailureAtMs: fc.integer(), lockedUntilMs: fc.integer(), pending: fc.constant(null).map(() => []) })
    fc.assert(fc.property(state, fc.integer({ min: 0, max: 2 ** 45 }), (s, now) => {
      checkThrottle(s, now)
      const { next } = recordFailure(s, now)
      return next.failures >= 1
    }))
  })
})

describe('試行中の札（acquireAttempt・completeAttempt）', () => {
  const acquire = (state: ThrottleState | null, at: number, id: string) => {
    const r = acquireAttempt(state, at, id)
    if (!r.success) throw new Error(`札が出るはず: ${JSON.stringify(r.error)}`)
    return r.value
  }

  it('同時に出せる札は、次に止める段までの残りの回数まで', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(remainingBeforeLock)).toEqual([3, 2, 1, 1, 1, 1, 1, 1])
  })

  it('失敗が0回なら札は3枚まで。4枚目は busy（少し待って）で、何も書かない', () => {
    let state: ThrottleState | null = null
    for (const id of ['a', 'b', 'c']) state = acquire(state, NOW, id)
    expect(acquireAttempt(state, NOW, 'd')).toEqual({ success: false, error: { kind: 'busy', retryAfterMs: 1000 } })
  })

  it('止まっていれば locked（札は出さない）', () => {
    const { state } = failTimes(3)
    expect(acquireAttempt(state, NOW + 2000 + 10_000, 'x')).toEqual({ success: false, error: { kind: 'locked', retryAfterMs: 50_000 } })
  })

  it('外し忘れた札は、期限で自然に消え、また札を出せる', () => {
    const { state: two } = failTimes(2) // 残り1枚
    const held = acquire(two, NOW + 2000, 'lost')
    expect(acquireAttempt(held, NOW + 2000 + LOGIN_PENDING_TTL_MS - 1, 'next').success).toBe(false)
    expect(acquireAttempt(held, NOW + 2000 + LOGIN_PENDING_TTL_MS, 'next').success).toBe(true)
  })

  it('success は確定した失敗を 0 に戻し、札も外す（記録を消してよい）', () => {
    const { state: two } = failTimes(2)
    const held = acquire(two, NOW + 2000, 'a')
    expect(completeAttempt(held, 'a', 'success', NOW + 2100)).toEqual({ next: null, lockMs: null, failures: 0 })
  })

  it('failure は確定した失敗を1回足し、止め始めたら lockMs', () => {
    const { state: two } = failTimes(2)
    const held = acquire(two, NOW + 2000, 'a')
    const done = completeAttempt(held, 'a', 'failure', NOW + 2100)
    expect(done.lockMs).toBe(1 * MIN)
    expect(done.next).toEqual({ failures: 3, lastFailureAtMs: NOW + 2100, lockedUntilMs: NOW + 2100 + MIN, pending: [] })
  })

  it('void（Firebase の障害）は札を外すだけ。確定した失敗も止める時刻も変えない', () => {
    const { state: before } = failTimes(3) // 1分止まる
    const at = NOW + 2000 + MIN // 止まりが切れた時刻
    const held = acquire(before, at, 'a')
    expect(completeAttempt(held, 'a', 'void', at + 100).next).toEqual(before)
  })

  it('ほかの札は残す（同時の試行の結果を待つ）', () => {
    const held = acquire(acquire(null, NOW, 'a'), NOW, 'b')
    const done = completeAttempt(held, 'a', 'failure', NOW + 10)
    expect(done.next?.pending.map((p) => p.id)).toEqual(['b'])
  })

  it('札を出していない（期限で消えた）試行が終わっても、結果は確定する', () => {
    expect(completeAttempt(null, 'gone', 'failure', NOW).next?.failures).toBe(1)
    expect(completeAttempt(null, 'gone', 'void', NOW).next).toBeNull()
  })

  it('acquireAll: どれかが止まっていれば locked（いちばん長い待ち）、どれかが埋まっていれば busy、断るなら何も返さない', () => {
    const { state: locked } = failTimes(3)
    const full = acquire(failTimes(2).state, NOW + 2000, 'x')
    expect(acquireAll([locked, full], NOW + 2000, 'y')).toEqual({ success: false, error: { kind: 'locked', retryAfterMs: MIN } })
    expect(acquireAll([null, full], NOW + 2000, 'y')).toEqual({ success: false, error: { kind: 'busy', retryAfterMs: 1000 } })
    const ok = acquireAll([null, null], NOW, 'y')
    expect(ok.success && ok.value.map((s) => s.pending.map((p) => p.id))).toEqual([['y'], ['y']])
  })
})
