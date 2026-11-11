import { LOGIN_BUSY_RETRY_MS, LOGIN_FAILURE_RESET_MS, LOGIN_LOCK_STEPS, LOGIN_PENDING_TTL_MS } from '@/constants/auth'
import type { Result } from '@/types/result'

// ログインの失敗回数の制限の判定（純粋）。保存は infra/auth/firestoreLoginThrottleRepository.ts。
//
// 「確定した失敗」（failures）は、パスワードが違ったときにしか増えず、成功したときにしか減らない。
// それとは別に、パスワードを確かめている最中の試行に「試行中の札」（pending）を付ける。
// 札の数は、次に止める段までの残りの回数までしか出さない。だから同時に送られても、止めるはずの回数を超えて Firebase に届かない
// （確かめてから数えると、同時の試行が全部「まだ止まっていない」を読んですり抜けた。2026-11-11 のバグハンティングで発見）。
// 札は確かめ終わったら外す（completeAttempt）。外し忘れても LOGIN_PENDING_TTL_MS で自然に消える
export type PendingAttempt = { id: string; expiresAtMs: number }

export type ThrottleState = {
  failures: number        // 続けて失敗した回数（確定したもの）
  lastFailureAtMs: number
  lockedUntilMs: number   // この時刻までパスワードを確かめない（止めていなければ 0 か過去）
  pending: PendingAttempt[]
}

export type AttemptOutcome = 'success' | 'failure' | 'void' // void: Firebase の障害で確かめられなかった（数えない）

export type AcquireRejection = { kind: 'locked' | 'busy'; retryAfterMs: number }

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

// 最後の失敗から LOGIN_FAILURE_RESET_MS たっていれば 0 回として扱う
function liveFailures(state: ThrottleState | null, nowMs: number): number {
  if (state === null || nowMs - state.lastFailureAtMs >= LOGIN_FAILURE_RESET_MS) return 0
  return Math.max(0, state.failures)
}

// 確定した失敗を1回足す。lockMs は、この失敗で止め始めたときだけ（Slack に知らせるため）。札はそのまま残す
export function recordFailure(state: ThrottleState | null, nowMs: number): { next: ThrottleState; lockMs: number | null } {
  const failures = liveFailures(state, nowMs) + 1
  const lockMs = lockDurationMs(failures)
  return {
    next: { failures, lastFailureAtMs: nowMs, lockedUntilMs: lockMs === null ? 0 : nowMs + lockMs, pending: state?.pending ?? [] },
    lockMs,
  }
}

// 次に止める段までの残りの回数（同時に出せる札の数）。止める段を過ぎていれば、失敗のたびに止めるので 1
export function remainingBeforeLock(failures: number): number {
  const next = LOGIN_LOCK_STEPS.find((step) => step.failures > failures)
  return next === undefined ? 1 : next.failures - failures
}

// 試す前に札を出す。止まっていれば locked、札が埋まっていれば busy（少し待ってもう一度）
export function acquireAttempt(
  state: ThrottleState | null,
  nowMs: number,
  attemptId: string,
): Result<ThrottleState, AcquireRejection> {
  const locked = checkThrottle(state, nowMs)
  if (!locked.success) return { success: false, error: { kind: 'locked', retryAfterMs: locked.error.retryAfterMs } }
  const pending = (state?.pending ?? []).filter((p) => p.expiresAtMs > nowMs) // 外し忘れた札は消えている
  if (pending.length >= remainingBeforeLock(liveFailures(state, nowMs))) {
    return { success: false, error: { kind: 'busy', retryAfterMs: LOGIN_BUSY_RETRY_MS } }
  }
  const base: ThrottleState = state ?? { failures: 0, lastFailureAtMs: 0, lockedUntilMs: 0, pending: [] }
  return { success: true, value: { ...base, pending: [...pending, { id: attemptId, expiresAtMs: nowMs + LOGIN_PENDING_TTL_MS }] } }
}

// すべての key に札を出す。どれかが止まっていれば locked（いちばん長い待ち時間）、どれかの札が埋まっていれば busy。
// どちらでもなければ、すべての key の次の状態（1つでも断るなら、どれにも書かない）
export function acquireAll(
  states: (ThrottleState | null)[],
  nowMs: number,
  attemptId: string,
): Result<ThrottleState[], AcquireRejection> {
  const results = states.map((s) => acquireAttempt(s, nowMs, attemptId))
  const rejections = results.flatMap((r) => (r.success ? [] : [r.error]))
  const locked = rejections.filter((r) => r.kind === 'locked')
  if (locked.length > 0) return { success: false, error: { kind: 'locked', retryAfterMs: Math.max(...locked.map((r) => r.retryAfterMs)) } }
  if (rejections.length > 0) return { success: false, error: { kind: 'busy', retryAfterMs: LOGIN_BUSY_RETRY_MS } }
  return { success: true, value: results.flatMap((r) => (r.success ? [r.value] : [])) }
}

// 確かめ終わったら札を外し、結果を確定させる。
// success: 確定した失敗を 0 に戻す / failure: 確定した失敗を1回足す（止め始めたら lockMs）/ void: 札を外すだけ。
// next が null なら記録を消してよい（失敗も札も残っていない）
export function completeAttempt(
  state: ThrottleState | null,
  attemptId: string,
  outcome: AttemptOutcome,
  nowMs: number,
): { next: ThrottleState | null; lockMs: number | null; failures: number } {
  const pending = (state?.pending ?? []).filter((p) => p.id !== attemptId && p.expiresAtMs > nowMs)
  const base: ThrottleState | null = state === null ? null : { ...state, pending }
  if (outcome === 'failure') {
    const { next, lockMs } = recordFailure(base, nowMs)
    return { next: { ...next, pending }, lockMs, failures: next.failures }
  }
  const cleared: ThrottleState | null = base === null ? null
    : outcome === 'success' ? { failures: 0, lastFailureAtMs: 0, lockedUntilMs: 0, pending }
    : base
  const empty = cleared === null || (liveFailures(cleared, nowMs) === 0 && cleared.lockedUntilMs <= nowMs && pending.length === 0)
  return { next: empty ? null : cleared, lockMs: null, failures: cleared === null ? 0 : liveFailures(cleared, nowMs) }
}
