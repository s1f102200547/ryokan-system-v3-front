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
  // 電話を登録していないアカウントが、パスワードだけでログインを終えてよいか（MFA_MODE=enrolled_only。src/lib/auth/mfaMode.ts）
  passwordOnlyAllowed: boolean
}

// Firebase 自身が止めたときに、こちらがまだ止めていなければ返す待ち時間
export const FIREBASE_THROTTLED_RETRY_MS = 60_000

// パスワードを確かめる。失敗が続いたメールアドレス・IP は、しばらく Firebase に送らずに断る（iPhone 方式）。
// 存在しないメールアドレスも、間違ったパスワードと同じに数える（どのアドレスが本物かを探らせない）。
// 確かめる前に「試行中の札」を出し、確かめ終わったら外して結果を確定させる（application/auth/loginAttempt.ts）。
// パスワードが合っても失敗の回数は 0 に戻さない。戻すのは SMS のコードが合ったとき（verifyMfaCodeCommand）。
// ただし、パスワードだけでログインを終えてよいアカウント（passwordOnlyAllowed で、電話を登録していない）は、ここで 0 に戻す
// （2要素目がないので、ここがログインの成功。戻さないと、スタッフの打ち間違いが1日たまって止められる）
export async function loginWithPasswordCommand(input: LoginInput): Promise<Result<PasswordSignInSuccess, LoginFailure>> {
  const { email, password, ip, nowMs, passwordOnlyAllowed } = input
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
    // 2要素目が残っていれば、札を外すだけ（数えない）。2要素目のないアカウントは、許されていればここで成功、いなければ Route が断る
    const completed = signIn.value.kind === 'signed_in' && passwordOnlyAllowed
    await finishAttempt(keys, attemptId, completed ? 'success' : 'void', nowMs)
    return signIn
  }

  logger.warn('ログイン失敗: パスワードの確認', { code: signIn.error.code })
  const lockMs = await finishAttempt(keys, attemptId, 'failure', nowMs)
  if (signIn.error.kind === 'firebase_throttled') {
    return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockMs > 0 ? lockMs : FIREBASE_THROTTLED_RETRY_MS } }
  }
  // この失敗で止め始めたなら、その場で伝える（F-20）。401 を返すと、次の試行が正しくても 429 で断られ、スタッフには理由が分からない
  if (lockMs > 0) return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockMs } }
  return { success: false, error: { kind: 'invalid_credentials' } }
}
