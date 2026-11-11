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

  // 止まっていないかの確認と失敗の記録を、確かめる前に1度に行う（先に数える）。
  // 止めている間は確かめず、回数も足さない（押すたびに延びないように）。同時に送られても、止める前の回数しか通らない
  const acquired = await firestoreLoginThrottleRepository.acquire(keys, nowMs)
  if (!acquired.success) return { success: false, error: { kind: 'rate_limited', retryAfterMs: acquired.error.retryAfterMs } }

  let signIn: Awaited<ReturnType<typeof signInWithPassword>>
  try {
    signIn = await signInWithPassword(email, password)
  } catch (e) {
    // Firebase の障害で確かめられなかった。先に数えた1回分を返す（障害が続いても、スタッフが止められないように）
    await firestoreLoginThrottleRepository.refund(keys, acquired.value, nowMs)
    throw e
  }

  if (!signIn.success) {
    acquired.value.forEach(({ lockMs, failures }, i) => {
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
