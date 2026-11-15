import { randomUUID } from 'node:crypto'
import { checkThrottle, type AttemptOutcome } from '@/domain/auth/loginThrottle'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { buildLoginLockNotice } from '@/lib/auth/loginNotice'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { InfraError } from '@/types/errors'
import type { ThrottleKey } from '@/domain/ports/loginThrottleRepository'
import type { Result } from '@/types/result'

// ログインの失敗回数の制限の手順。パスワードの確認（loginWithPasswordCommand）と SMS のコードの確認（verifyMfaCodeCommand）が、
// 同じメールアドレス・IP の key を同じ表で数える（domain/auth/loginThrottle.ts）。
// 確定した失敗を 0 に戻すのは、コードが合ったとき（ログインが最後まで通ったとき）だけ。
// パスワードが合っただけで 0 に戻すと、パスワードを知る攻撃者が「パスワード → コード」を繰り返して、コードを無限に試せる

export type ThrottleRejection =
  | { kind: 'rate_limited'; retryAfterMs: number } // 失敗が続いて止めている
  | { kind: 'busy'; retryAfterMs: number }         // 同時の試行が確かめ終わるのを待つ（ブラウザが自動で送り直す）

// ip は X-Forwarded-For の右端。取れなければ 'unknown'（1つの key にまとめて数える）
export function throttleKeys(email: string, ip: string | null): ThrottleKey[] {
  return [
    { kind: 'email', value: email },
    { kind: 'ip', value: ip ?? 'unknown' },
  ]
}

// 確かめる前に、止まっていないかを見て試行中の札を出す。返すのは札の ID
export async function beginAttempt(keys: ThrottleKey[], nowMs: number): Promise<Result<string, ThrottleRejection>> {
  // 止まっているかを、トランザクションの前に安く確かめる（攻撃の大半はここで終わる。トランザクションのぶつかり合いも減る）
  const states = await firestoreLoginThrottleRepository.read(keys)
  const lockedFor = Math.max(0, ...states.map((s) => {
    const r = checkThrottle(s, nowMs)
    return r.success ? 0 : r.error.retryAfterMs
  }))
  if (lockedFor > 0) return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockedFor } }

  // 止まっていれば rate_limited、札が埋まっていれば busy（どちらも Firebase に送らない）
  const attemptId = randomUUID()
  const acquired = await firestoreLoginThrottleRepository.acquire(keys, nowMs, attemptId)
  if (!acquired.success) {
    const kind = acquired.error.kind === 'locked' ? 'rate_limited' : 'busy'
    return { success: false, error: { kind, retryAfterMs: acquired.error.retryAfterMs } }
  }
  return { success: true, value: attemptId }
}

// 札を外して結果を確定させる。返すのは、この結果で止め始めた時間（いちばん長いもの。止めなければ 0）。
// 失敗しても応答は変えない（札は LOGIN_PENDING_TTL_MS で自然に消える）。記録できなかったことはログと Slack に残す
export async function finishAttempt(keys: ThrottleKey[], attemptId: string, outcome: AttemptOutcome, nowMs: number): Promise<number> {
  let recorded: { lockMs: number | null; failures: number }[]
  try {
    recorded = await firestoreLoginThrottleRepository.complete(keys, attemptId, outcome, nowMs)
  } catch (e) {
    const code = e instanceof InfraError ? e.code : 'UNKNOWN'
    logger.error('ログインの回数の記録に失敗', { outcome, infraErrorCode: code })
    notifySlackFireAndForget(`[ALERT] ログインの回数の記録に失敗(${code})。結果: ${outcome}`)
    return 0
  }
  let lockMs = 0
  recorded.forEach((r, i) => {
    if (r.lockMs === null) return
    lockMs = Math.max(lockMs, r.lockMs)
    // 止め始めたときだけ知らせる。正しいスタッフが止められたときに開発者が気付けるように
    logger.warn('ログイン制限', { kind: keys[i].kind, failures: r.failures, lockMs: r.lockMs })
    notifySlackFireAndForget(buildLoginLockNotice({ key: keys[i], failures: r.failures, lockMs: r.lockMs }))
  })
  return lockMs
}
