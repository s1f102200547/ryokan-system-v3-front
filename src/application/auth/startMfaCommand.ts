import { randomBytes } from 'node:crypto'
import { startPhoneMfa } from '@/infra/auth/mfaSignIn'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { firestoreSmsQuotaRepository } from '@/infra/auth/firestoreSmsQuotaRepository'
import { buildSmsLimitNotice } from '@/lib/auth/loginNotice'
import { getTodayJST } from '@/lib/dateUtils'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { MFA_PENDING_TTL_MS, MFA_SMS_DAILY_LIMIT } from '@/constants/auth'
import { FIREBASE_THROTTLED_RETRY_MS } from '@/application/auth/loginWithPasswordCommand'
import type { Result } from '@/types/result'

type StartMfaInput = {
  email: string
  ip: string | null
  forwardedFor: string | null // Slack の通知に載せる
  mfaPendingCredential: string
  mfaEnrollmentId: string
  phoneHint: string
  nowMs: number
}

// sms_limit: 今日の上限を超えた / sms_throttled: Firebase 自身が SMS の送信を止めた
export type StartMfaFailure = { kind: 'sms_limit' } | { kind: 'sms_throttled'; retryAfterMs: number }

// パスワードが合った後に、登録済みの電話へ SMS を送り、途中の状態を保存する。返す pendingId は Cookie で運ぶ（推測できない乱数）。
// 呼ぶのは、パスワードと端末・ブラウザの確認を通った後だけ（条件に合わない端末には送らない）
export async function startMfaCommand(input: StartMfaInput): Promise<Result<{ pendingId: string; phoneHint: string }, StartMfaFailure>> {
  const { email, ip, forwardedFor, mfaPendingCredential, mfaEnrollmentId, phoneHint, nowMs } = input

  // 送る前に数える（送ってから数えると、同時に送られたときに上限を超える）
  const quota = await firestoreSmsQuotaRepository.consume(email, getTodayJST())
  if (!quota.allowed) {
    logger.warn('ログイン: SMS の上限', { firstRejection: quota.firstRejection })
    if (quota.firstRejection) notifySlackFireAndForget(buildSmsLimitNotice({ account: email, limit: MFA_SMS_DAILY_LIMIT, forwardedFor, nowMs }))
    return { success: false, error: { kind: 'sms_limit' } }
  }

  const started = await startPhoneMfa(mfaPendingCredential, mfaEnrollmentId)
  if (!started.success) {
    logger.warn('ログイン: Firebase が SMS の送信を止めた', { code: started.error.code })
    return { success: false, error: { kind: 'sms_throttled', retryAfterMs: FIREBASE_THROTTLED_RETRY_MS } }
  }

  const pendingId = randomBytes(32).toString('base64url')
  await firestoreMfaPendingRepository.save(pendingId, {
    email, ip, mfaPendingCredential, sessionInfo: started.value.sessionInfo, phoneHint, expiresAtMs: nowMs + MFA_PENDING_TTL_MS,
  })
  return { success: true, value: { pendingId, phoneHint } }
}
