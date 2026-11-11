import { LOGIN_FAILURE_RESET_MS, LOGIN_LOCK_STEPS } from '@/constants/auth'
import type { Result } from '@/types/result'

// ログインの失敗回数の制限の判定（純粋）。保存は infra/auth/firestoreLoginThrottleRepository.ts
export type ThrottleState = {
  failures: number        // 続けて失敗した回数
  lastFailureAtMs: number
  lockedUntilMs: number   // この時刻までパスワードを確かめない（止めていなければ 0 か過去）
}

// 続けて failures 回失敗したときに止める時間。止めなければ null
export function lockDurationMs(failures: number): number | null {
  let lockMs: number | null = null
  for (const step of LOGIN_LOCK_STEPS) {
    if (failures >= step.failures) lockMs = step.lockMs
  }
  return lockMs
}

// 止めている間なら、あと何 ms で試せるか
export function checkThrottle(state: ThrottleState | null, nowMs: number): Result<void, { retryAfterMs: number }> {
  if (state === null || state.lockedUntilMs <= nowMs) return { success: true, value: undefined }
  return { success: false, error: { retryAfterMs: state.lockedUntilMs - nowMs } }
}

// 失敗を1回足す。最後の失敗から LOGIN_FAILURE_RESET_MS たっていれば 1 から数える。
// lockMs は、この失敗で止め始めたときだけ（Slack に知らせるため）
export function recordFailure(state: ThrottleState | null, nowMs: number): { next: ThrottleState; lockMs: number | null } {
  const expired = state === null || nowMs - state.lastFailureAtMs >= LOGIN_FAILURE_RESET_MS
  const failures = (expired ? 0 : Math.max(0, state.failures)) + 1
  const lockMs = lockDurationMs(failures)
  return {
    next: { failures, lastFailureAtMs: nowMs, lockedUntilMs: lockMs === null ? 0 : nowMs + lockMs },
    lockMs,
  }
}
