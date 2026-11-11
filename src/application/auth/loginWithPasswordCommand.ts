import { checkThrottle } from '@/domain/auth/loginThrottle'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { isPasswordSignInConfigured, signInWithPassword } from '@/infra/auth/passwordSignIn'
import { InfraError } from '@/types/errors'
import { buildLoginLockNotice } from '@/lib/auth/loginNotice'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { ThrottleKey } from '@/domain/ports/loginThrottleRepository'
import type { Result } from '@/types/result'

export type LoginFailure =
  | { kind: 'invalid_credentials' }
  | { kind: 'rate_limited'; retryAfterMs: number }

type LoginInput = {
  email: string
  password: string
  ip: string | null // X-Forwarded-For の右端。取れなければ null（1つの key にまとめて数える）
  nowMs: number
}

// パスワードを確かめる。失敗が続いたメールアドレス・IP は、しばらく Firebase に送らずに断る（iPhone 方式）。
// 存在しないメールアドレスも、間違ったパスワードと同じに数える（どのアドレスが本物かを探らせない）
export async function loginWithPasswordCommand(input: LoginInput): Promise<Result<{ idToken: string }, LoginFailure>> {
  const { email, password, ip, nowMs } = input
  // パスワードを確かめられない（API キーの設定忘れ）なら、回数を読む前に障害として断る（503・Slack）
  if (!isPasswordSignInConfigured()) throw new InfraError('AUTH_UNAVAILABLE', 'FIREBASE_AUTH_API_KEY is not set')
  const keys: ThrottleKey[] = [
    { kind: 'email', value: email },
    { kind: 'ip', value: ip ?? 'unknown' },
  ]

  // 止めている間は確かめない。回数も足さない（押すたびに延びないように）
  const states = await firestoreLoginThrottleRepository.read(keys)
  const retryAfterMs = Math.max(0, ...states.map((s) => {
    const r = checkThrottle(s, nowMs)
    return r.success ? 0 : r.error.retryAfterMs
  }))
  if (retryAfterMs > 0) return { success: false, error: { kind: 'rate_limited', retryAfterMs } }

  const signIn = await signInWithPassword(email, password)
  if (!signIn.success) {
    const recorded = await firestoreLoginThrottleRepository.recordFailure(keys, nowMs)
    recorded.forEach(({ lockMs, failures }, i) => {
      if (lockMs === null) return
      // 止め始めたときだけ知らせる。正しいスタッフが止められたときに開発者が気付けるように
      logger.warn('ログイン制限', { kind: keys[i].kind, failures, lockMs })
      notifySlackFireAndForget(buildLoginLockNotice({ key: keys[i], failures, lockMs }))
    })
    return { success: false, error: { kind: 'invalid_credentials' } }
  }

  await firestoreLoginThrottleRepository.reset(keys)
  return signIn
}
