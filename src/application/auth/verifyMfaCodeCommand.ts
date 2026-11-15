import { checkMfaPending } from '@/domain/auth/mfaPending'
import { finalizePhoneMfa } from '@/infra/auth/mfaSignIn'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { beginAttempt, finishAttempt, throttleKeys, type ThrottleRejection } from '@/application/auth/loginAttempt'
import { FIREBASE_THROTTLED_RETRY_MS } from '@/application/auth/loginWithPasswordCommand'
import { logger } from '@/lib/logger'
import { InfraError } from '@/types/errors'
import type { Result } from '@/types/result'

type VerifyInput = {
  pendingId: string
  code: string
  ip: string | null
  nowMs: number
}

// invalid_code: コードが違う（同じ画面で打ち直せる）/ expired: 途中の状態がない・期限切れ（パスワードからやり直す）/
// ip_mismatch: パスワードを確かめたときと接続元が違う（途中の状態を消し、やり直させる）
export type VerifyMfaFailure = { kind: 'invalid_code' | 'expired' | 'ip_mismatch' } | ThrottleRejection

// SMS のコードを確かめ、2要素目を通った ID トークンを返す。
// コードの誤りは、パスワードの誤りと同じ key・同じ表で数える。コードが合ったら失敗の回数を 0 に戻す（ログインが最後まで通った）
export async function verifyMfaCodeCommand(input: VerifyInput): Promise<Result<{ idToken: string; email: string }, VerifyMfaFailure>> {
  const { pendingId, code, ip, nowMs } = input

  const checked = checkMfaPending(await firestoreMfaPendingRepository.get(pendingId), ip, nowMs)
  if (!checked.success) {
    await deleteQuietly(pendingId)
    return { success: false, error: { kind: checked.error } }
  }
  const pending = checked.value

  const keys = throttleKeys(pending.email, ip)
  const begun = await beginAttempt(keys, nowMs)
  if (!begun.success) return begun
  const attemptId = begun.value

  let finalized: Awaited<ReturnType<typeof finalizePhoneMfa>>
  try {
    finalized = await finalizePhoneMfa(pending.mfaPendingCredential, pending.sessionInfo, code)
  } catch (e) {
    await finishAttempt(keys, attemptId, 'void', nowMs)
    throw e
  }

  if (finalized.success) {
    await finishAttempt(keys, attemptId, 'success', nowMs)
    // 一度使った途中の状態は使えない（Firebase 側でも使い終わっている）。消せなくても期限で消える
    await deleteQuietly(pendingId)
    return { success: true, value: { idToken: finalized.value.idToken, email: pending.email } }
  }

  logger.warn('ログイン失敗: SMS のコードの確認', { code: finalized.error.code })
  if (finalized.error.kind === 'expired') {
    // 期限が切れていて、コードが正しいかは分からない。数えない
    await finishAttempt(keys, attemptId, 'void', nowMs)
    await deleteQuietly(pendingId)
    return { success: false, error: { kind: 'expired' } }
  }
  const lockMs = await finishAttempt(keys, attemptId, 'failure', nowMs)
  if (finalized.error.kind === 'throttled') {
    return { success: false, error: { kind: 'rate_limited', retryAfterMs: lockMs > 0 ? lockMs : FIREBASE_THROTTLED_RETRY_MS } }
  }
  return { success: false, error: { kind: 'invalid_code' } }
}

async function deleteQuietly(pendingId: string): Promise<void> {
  try {
    await firestoreMfaPendingRepository.delete(pendingId)
  } catch (e) {
    logger.warn('ログイン: 途中の状態を消せなかった（期限で消える）', { infraErrorCode: e instanceof InfraError ? e.code : 'UNKNOWN' })
  }
}
