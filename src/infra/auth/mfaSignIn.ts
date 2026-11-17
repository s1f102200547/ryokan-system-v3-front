import { z } from 'zod'
import { InfraError } from '@/types/errors'
import { callIdentityToolkit, type IdentityToolkitResponse } from '@/infra/auth/identityToolkit'
import type { Result } from '@/types/result'

// SMS の2要素目（Identity Platform の REST API、v2 accounts/mfaSignIn:start・finalize）。
// start で登録済みの電話に SMS を送り、finalize で利用者が打ったコードを確かめて ID トークンを得る。
// コード・mfaPendingCredential・sessionInfo・idToken は、ログにも例外のメッセージにも入れない

const StartSchema = z.object({ phoneResponseInfo: z.object({ sessionInfo: z.string().min(1) }) })
const FinalizeSchema = z.object({ idToken: z.string().min(1) })

// throttled: Firebase 自身が SMS の送信やコードの確認を止めた（同じ電話への送りすぎなど）/
// recaptcha_rejected: ブラウザが作った reCAPTCHA の token を断った（期限切れ・使い回し・別のサイトで作った token・点数が低い）
// description: Google の説明の文（伏せたもの。src/infra/auth/identityToolkit.ts）。reCAPTCHA の原因（ドメイン・キー）を一度で見分ける
// failed: 振り分けにないエラーの応答（設定の問題・Firebase の障害）。呼び出し側が障害（503・Slack）にする。summary はその例外のメッセージに使う
// どれも Firebase がエラーの応答を返した = SMS は送っていない（呼び出し側は1日の通数を戻してよい）
export type StartPhoneMfaFailure =
  | { kind: 'throttled'; code: string }
  | { kind: 'recaptcha_rejected'; code: string; description: string }
  | { kind: 'failed'; summary: string }

// SMS を送る。返す sessionInfo を finalize に渡す。
// 本番の Identity Platform は reCAPTCHA Enterprise の token を求める（recaptchaToken。ブラウザが作る）。Emulator は見ない。
// token を求められたのに渡していないとき（MISSING_RECAPTCHA_TOKEN・MISSING_CLIENT_IDENTIFIER: サイトキーの設定忘れ）は、
// 設定の問題なので failed（呼び出し側が 503・Slack）。
// 例外（AUTH_UNAVAILABLE）は、SMS を送れたかが分からないときだけ: 応答がない（タイムアウト・通信の失敗）か、200 なのに sessionInfo がない
export async function startPhoneMfa(
  mfaPendingCredential: string,
  mfaEnrollmentId: string,
  recaptchaToken: string | null,
): Promise<Result<{ sessionInfo: string }, StartPhoneMfaFailure>> {
  const phoneSignInInfo = recaptchaToken === null
    ? {}
    : { captchaResponse: recaptchaToken, clientType: 'CLIENT_TYPE_WEB', recaptchaVersion: 'RECAPTCHA_ENTERPRISE' }
  const res = await callIdentityToolkit(
    'v2/accounts/mfaSignIn:start',
    { mfaPendingCredential, mfaEnrollmentId, phoneSignInInfo },
    'MFA sign-in start',
  )
  if (res.ok) {
    const parsed = StartSchema.safeParse(res.body)
    if (!parsed.success) throw new InfraError('AUTH_UNAVAILABLE', 'MFA sign-in start returned no sessionInfo (status 200)')
    return { success: true, value: { sessionInfo: parsed.data.phoneResponseInfo.sessionInfo } }
  }
  if (THROTTLED_ERRORS.has(res.code)) return { success: false, error: { kind: 'throttled', code: res.code } }
  // 利用者のブラウザが作った token が原因（数分たった・2回使った）。こちらから token を渡したときだけ（渡していなければ設定の問題）
  if (recaptchaToken !== null && RECAPTCHA_REJECTED_ERRORS.has(res.code)) {
    return { success: false, error: { kind: 'recaptcha_rejected', code: res.code, description: res.description } }
  }
  return { success: false, error: { kind: 'failed', summary: failureSummary(res) } }
}

// reCAPTCHA の確認で断られた。INVALID_RECAPTCHA_TOKEN: token が使えない（期限切れ・使い回し・localhost）/
// CAPTCHA_CHECK_FAILED: 点数が低い（公式のトラブルシューティングが挙げるコード。本番ではまだ見ていない）。
// SMS defense（料金詐欺の判定）で止めたときのコードは公式にも書かれていない。ここにないコードは 503・Slack にコード名が出るので、見て足す
const RECAPTCHA_REJECTED_ERRORS = new Set(['INVALID_RECAPTCHA_TOKEN', 'CAPTCHA_CHECK_FAILED'])

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
  throw new InfraError('AUTH_UNAVAILABLE', `MFA sign-in finalize failed: ${failureSummary(res)}`)
}

// 振り分けにないコード（start は failed の summary、finalize は例外のメッセージ。どちらも 503・[ALERT]）。本番で初めて見るコードの意味が分かるよう、説明の文も付ける
function failureSummary(res: Extract<IdentityToolkitResponse, { ok: false }>): string {
  return `${res.code} (status ${res.status})${res.description ? ` - ${res.description}` : ''}`
}

// コードの誤り（打ち直せる）
const INVALID_CODE_ERRORS = new Set(['INVALID_CODE', 'INVALID_VERIFICATION_CODE', 'MISSING_CODE'])
// 期限切れ。mfaPendingCredential・sessionInfo・コードのどれか
const EXPIRED_ERRORS = new Set(['SESSION_EXPIRED', 'CODE_EXPIRED', 'INVALID_MFA_PENDING_CREDENTIAL', 'INVALID_SESSION_INFO'])
const THROTTLED_ERRORS = new Set(['TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED'])
