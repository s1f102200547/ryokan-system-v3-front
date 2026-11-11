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

// 試す前に、止まっていないかの確認と失敗の記録を1度に行う（先に数える）。
// 確かめてから数えると、同時に送られた試行が全部「まだ止まっていない」を読み、制限をすり抜ける（2026-11-11 のバグハンティングで発見）。
// 成功したら reset で 0 に戻し、障害で確かめられなかったら refundFailure で1回分を返す
export function acquireAttempt(
  state: ThrottleState | null,
  nowMs: number,
): Result<{ next: ThrottleState; lockMs: number | null }, { retryAfterMs: number }> {
  const check = checkThrottle(state, nowMs)
  if (!check.success) return check
  return { success: true, value: recordFailure(state, nowMs) }
}

// acquireAttempt で先に数えた1回分を返す（Firebase の障害で、パスワードを確かめられなかったとき）。
// previous は先に数える前の状態、attemptAtMs は先に数えた時刻。
// 間にほかの試行がなければ、先に数える前の状態にそのまま戻す（最後の失敗の時刻も戻す。戻さないと止める時間が今から数え直しになる）。
// ほかの試行が割り込んでいたら、回数だけ1つ減らす（その試行の時刻は残す）。0 回になれば null（記録を消す）
export function refundFailure(current: ThrottleState | null, previous: ThrottleState | null, attemptAtMs: number): ThrottleState | null {
  if (current === null) return null
  const untouched = current.lastFailureAtMs === attemptAtMs && current.failures === (previous?.failures ?? 0) + 1
  if (untouched) return previous
  const failures = Math.max(0, current.failures - 1)
  if (failures === 0) return null
  const lockMs = lockDurationMs(failures)
  return { failures, lastFailureAtMs: current.lastFailureAtMs, lockedUntilMs: lockMs === null ? 0 : current.lastFailureAtMs + lockMs }
}
