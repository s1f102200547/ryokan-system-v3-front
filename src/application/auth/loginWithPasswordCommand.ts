import { randomUUID } from 'node:crypto'
import { checkThrottle, type AttemptOutcome } from '@/domain/auth/loginThrottle'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { isPasswordSignInConfigured, signInWithPassword, type PasswordSignInSuccess } from '@/infra/auth/passwordSignIn'
import { buildLoginLockNotice } from '@/lib/auth/loginNotice'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { InfraError } from '@/types/errors'
import type { ThrottleKey } from '@/domain/ports/loginThrottleRepository'
import type { Result } from '@/types/result'

export type LoginFailure =
  | { kind: 'invalid_credentials' }
  | { kind: 'rate_limited'; retryAfterMs: number } // 失敗が続いて止めている
  | { kind: 'busy'; retryAfterMs: number }         // 同時の試行が確かめ終わるのを待つ（ブラウザが自動で送り直す）

type LoginInput = {
  email: string
  password: string
  ip: string | null // X-Forwarded-For の右端。取れなければ null（1つの key にまとめて数える）
  nowMs: number
}

// Firebase 自身が止めたときに、こちらがまだ止めていなければ返す待ち時間
const FIREBASE_THROTTLED_RETRY_MS = 60_000

// パスワードを確かめる。失敗が続いたメールアドレス・IP は、しばらく Firebase に送らずに断る（iPhone 方式）。
// 存在しないメールアドレスも、間違ったパスワードと同じに数える（どのアドレスが本物かを探らせない）。
// 確かめる前に「試行中の札」を出し、確かめ終わったら外して結果を確定させる（domain/auth/loginThrottle.ts）
export async function loginWithPasswordCommand(input: LoginInput): Promise<Result<PasswordSignInSuccess, LoginFailure>> {
  const { email, password, ip, nowMs } = input
  // パスワードを確かめられない（API キーの設定忘れ）なら、回数を読む前に障害として断る（503・Slack）
  if (!isPasswordSignInConfigured()) throw new InfraError('AUTH_UNAVAILABLE', 'FIREBASE_AUTH_API_KEY is not set')

  const keys: ThrottleKey[] = [
    { kind: 'email', value: email },
    { kind: 'ip', value: ip ?? 'unknown' },
  ]

  // 止まっているかを、トランザクションの前に安く確かめる（攻撃の大半はここで終わる。トランザクションのぶつかり合いも減る）
  const states = await firestoreLoginThrottleRepository.read(keys)
  const lockedFor = Math.max(0, ...states.map((s) => {
    const r = checkThrottle(s, nowMs)
    return r.success ? 0 : r.error.retryAfterMs
  }))
  if (lockedFor > 0) return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockedFor } }

  // 試行中の札を出す。止まっていれば rate_limited、札が埋まっていれば busy（どちらも Firebase に送らない）
  const attemptId = randomUUID()
  const acquired = await firestoreLoginThrottleRepository.acquire(keys, nowMs, attemptId)
  if (!acquired.success) {
    const kind = acquired.error.kind === 'locked' ? 'rate_limited' : 'busy'
    return { success: false, error: { kind, retryAfterMs: acquired.error.retryAfterMs } }
  }

  let signIn: Awaited<ReturnType<typeof signInWithPassword>>
  try {
    signIn = await signInWithPassword(email, password)
  } catch (e) {
    // Firebase の障害で確かめられなかった。札を外すだけ（数えない）。札を外せなくても札は自然に消えるので、元の障害を投げ直す
    await completeQuietly(keys, attemptId, 'void', nowMs)
    throw e
  }

  if (signIn.success) {
    // 札を外して 0 に戻す。外せなくてもログインは成功のまま進める（札は自然に消える）
    await completeQuietly(keys, attemptId, 'success', nowMs)
    return signIn
  }

  logger.warn('ログイン失敗: パスワードの確認', { code: signIn.error.code })
  const recorded = await completeQuietly(keys, attemptId, 'failure', nowMs)
  let lockMs = 0
  recorded?.forEach((r, i) => {
    if (r.lockMs === null) return
    lockMs = Math.max(lockMs, r.lockMs)
    // 止め始めたときだけ知らせる。正しいスタッフが止められたときに開発者が気付けるように
    logger.warn('ログイン制限', { kind: keys[i].kind, failures: r.failures, lockMs: r.lockMs })
    notifySlackFireAndForget(buildLoginLockNotice({ key: keys[i], failures: r.failures, lockMs: r.lockMs }))
  })
  if (signIn.error.kind === 'firebase_throttled') {
    return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockMs > 0 ? lockMs : FIREBASE_THROTTLED_RETRY_MS } }
  }
  return { success: false, error: { kind: 'invalid_credentials' } }
}

// 札を外す。失敗しても応答は変えない（札は LOGIN_PENDING_TTL_MS で自然に消える）。記録できなかったことはログと Slack に残す
async function completeQuietly(keys: ThrottleKey[], attemptId: string, outcome: AttemptOutcome, nowMs: number) {
  try {
    return await firestoreLoginThrottleRepository.complete(keys, attemptId, outcome, nowMs)
  } catch (e) {
    const code = e instanceof InfraError ? e.code : 'UNKNOWN'
    logger.error('ログインの回数の記録に失敗', { outcome, infraErrorCode: code })
    notifySlackFireAndForget(`[ALERT] ログインの回数の記録に失敗(${code})。結果: ${outcome}`)
    return null
  }
}
