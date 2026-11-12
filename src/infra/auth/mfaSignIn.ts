import { z } from 'zod'
import { InfraError } from '@/types/errors'
import { callIdentityToolkit } from '@/infra/auth/identityToolkit'
import type { Result } from '@/types/result'

// SMS の2要素目（Identity Platform の REST API、v2 accounts/mfaSignIn:start・finalize）。
// start で登録済みの電話に SMS を送り、finalize で利用者が打ったコードを確かめて ID トークンを得る。
// コード・mfaPendingCredential・sessionInfo・idToken は、ログにも例外のメッセージにも入れない

const StartSchema = z.object({ phoneResponseInfo: z.object({ sessionInfo: z.string().min(1) }) })
const FinalizeSchema = z.object({ idToken: z.string().min(1) })

// throttled: Firebase 自身が SMS の送信やコードの確認を止めた（同じ電話への送りすぎなど）
export type StartPhoneMfaFailure = { kind: 'throttled'; code: string }

// SMS を送る。返す sessionInfo を finalize に渡す。
// reCAPTCHA の token を求められたとき（MISSING_RECAPTCHA_TOKEN・INVALID_APP_CREDENTIAL など）は、設定の問題なので障害（503・Slack）
export async function startPhoneMfa(
  mfaPendingCredential: string,
  mfaEnrollmentId: string,
): Promise<Result<{ sessionInfo: string }, StartPhoneMfaFailure>> {
  const res = await callIdentityToolkit(
    'v2/accounts/mfaSignIn:start',
    { mfaPendingCredential, mfaEnrollmentId, phoneSignInInfo: {} },
    'MFA sign-in start',
  )
  if (res.ok) {
    const parsed = StartSchema.safeParse(res.body)
    if (!parsed.success) throw new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in start returned no sessionInfo (status 200)')
    return { success: true, value: { sessionInfo: parsed.data.phoneResponseInfo.sessionInfo } }
  }
  if (THROTTLED_ERRORS.has(res.code)) return { success: false, error: { kind: 'throttled', code: res.code } }
  throw new InfraError('AUTH_UNAVAILABLE', `MFA sign-in start failed: ${res.code} (status ${res.status})`)
}

// invalid_code: コードが違う（打ち直せる。失敗として数える）/ expired: コードか途中の状態の期限が切れた（最初からやり直す）
export type FinalizePhoneMfaFailure = { kind: 'invalid_code' | 'expired' | 'throttled'; code: string }

export async function finalizePhoneMfa(
  mfaPendingCredential: string,
  sessionInfo: string,
  code: string,
): Promise<Result<{ idToken: string }, FinalizePhoneMfaFailure>> {
  const res = await callIdentityToolkit(
    'v2/accounts/mfaSignIn:finalize',
    { mfaPendingCredential, phoneVerificationInfo: { sessionInfo, code } },
    'MFA sign-in finalize',
  )
  if (res.ok) {
    const parsed = FinalizeSchema.safeParse(res.body)
    if (!parsed.success) throw new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in finalize returned no idToken (status 200)')
    return { success: true, value: { idToken: parsed.data.idToken } }
  }
  if (INVALID_CODE_ERRORS.has(res.code)) return { success: false, error: { kind: 'invalid_code', code: res.code } }
  if (EXPIRED_ERRORS.has(res.code)) return { success: false, error: { kind: 'expired', code: res.code } }
  if (THROTTLED_ERRORS.has(res.code)) return { success: false, error: { kind: 'throttled', code: res.code } }
  throw new InfraError('AUTH_UNAVAILABLE', `MFA sign-in finalize failed: ${res.code} (status ${res.status})`)
}

// コードの誤り（打ち直せる）
const INVALID_CODE_ERRORS = new Set(['INVALID_CODE', 'INVALID_VERIFICATION_CODE', 'MISSING_CODE'])
// 期限切れ。mfaPendingCredential・sessionInfo・コードのどれか
const EXPIRED_ERRORS = new Set(['SESSION_EXPIRED', 'CODE_EXPIRED', 'INVALID_MFA_PENDING_CREDENTIAL', 'INVALID_SESSION_INFO'])
const THROTTLED_ERRORS = new Set(['TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED'])
