import { isPasswordSignInConfigured, signInWithPassword, type PasswordSignInSuccess } from '@/infra/auth/passwordSignIn'
import { beginAttempt, finishAttempt, throttleKeys, type ThrottleRejection } from '@/application/auth/loginAttempt'
import { logger } from '@/lib/logger'
import { InfraError } from '@/types/errors'
import type { Result } from '@/types/result'

export type LoginFailure = { kind: 'invalid_credentials' } | ThrottleRejection

type LoginInput = {
  email: string
  password: string
  ip: string | null // X-Forwarded-For の右端。取れなければ null（1つの key にまとめて数える）
  nowMs: number
}

// Firebase 自身が止めたときに、こちらがまだ止めていなければ返す待ち時間
export const FIREBASE_THROTTLED_RETRY_MS = 60_000

// パスワードを確かめる。失敗が続いたメールアドレス・IP は、しばらく Firebase に送らずに断る（iPhone 方式）。
// 存在しないメールアドレスも、間違ったパスワードと同じに数える（どのアドレスが本物かを探らせない）。
// 確かめる前に「試行中の札」を出し、確かめ終わったら外して結果を確定させる（application/auth/loginAttempt.ts）。
// パスワードが合っても失敗の回数は 0 に戻さない。戻すのは SMS のコードが合ったとき（verifyMfaCodeCommand）
export async function loginWithPasswordCommand(input: LoginInput): Promise<Result<PasswordSignInSuccess, LoginFailure>> {
  const { email, password, ip, nowMs } = input
  // パスワードを確かめられない（API キーの設定忘れ）なら、回数を読む前に障害として断る（503・Slack）
  if (!isPasswordSignInConfigured()) throw new InfraError('AUTH_UNAVAILABLE', 'FIREBASE_AUTH_API_KEY is not set')

  const keys = throttleKeys(email, ip)
  const begun = await beginAttempt(keys, nowMs)
  if (!begun.success) return begun
  const attemptId = begun.value

  let signIn: Awaited<ReturnType<typeof signInWithPassword>>
  try {
    signIn = await signInWithPassword(email, password)
  } catch (e) {
    // Firebase の障害で確かめられなかった。札を外すだけ（数えない）。札を外せなくても札は自然に消えるので、元の障害を投げ直す
    await finishAttempt(keys, attemptId, 'void', nowMs)
    throw e
  }

  if (signIn.success) {
    // 札を外すだけ（数えない）。ログインはまだ終わっていない（2要素目が残っている。2要素目のないアカウントは Route が断る）
    await finishAttempt(keys, attemptId, 'void', nowMs)
    return signIn
  }

  logger.warn('ログイン失敗: パスワードの確認', { code: signIn.error.code })
  const lockMs = await finishAttempt(keys, attemptId, 'failure', nowMs)
  if (signIn.error.kind === 'firebase_throttled') {
    return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockMs > 0 ? lockMs : FIREBASE_THROTTLED_RETRY_MS } }
  }
  return { success: false, error: { kind: 'invalid_credentials' } }
}
