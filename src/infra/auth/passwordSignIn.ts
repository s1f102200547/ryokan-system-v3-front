import { z } from 'zod'
import { InfraError } from '@/types/errors'
import { callIdentityToolkit, isIdentityToolkitConfigured } from '@/infra/auth/identityToolkit'
import type { Result } from '@/types/result'

// パスワードの確認（Firebase Auth の REST API、accounts:signInWithPassword）。
// ブラウザから Firebase を呼ばないため、サーバーが確かめる。API キーはサーバーだけが持つ（FIREBASE_AUTH_API_KEY）。
// パスワード・リクエストの body・応答の body は、ログにも例外のメッセージにも入れない。載せるのはエラーコードと HTTP status だけ

// メールアドレスかパスワードが違う（利用者のせい。数えて 401 にする）。
// 本番はメールアドレスの列挙対策で INVALID_LOGIN_CREDENTIALS にまとまる。Emulator は INVALID_PASSWORD・EMAIL_NOT_FOUND を返す
const CREDENTIAL_ERRORS = new Set([
  'INVALID_LOGIN_CREDENTIALS',
  'INVALID_PASSWORD',
  'EMAIL_NOT_FOUND',
  'USER_DISABLED',
  'INVALID_EMAIL',
])

const SignedInSchema = z.object({ idToken: z.string().min(1) })
// 2要素目が要る応答。phoneInfo はサインインの応答では伏せ字（例: +81*******1234）
const MfaRequiredSchema = z.object({
  mfaPendingCredential: z.string().min(1),
  mfaInfo: z.array(z.object({ mfaEnrollmentId: z.string().min(1), phoneInfo: z.string().optional() })),
})

// API キーがあり、パスワードを確かめられるか。なければログインは確かめようがないので、Firestore も読まずにすぐ断る
// （CI の ZAP は本番ビルドを環境変数なしで起動する。GCP の認証もないので、Firestore を読むと諦めるまで約8秒かかる）
export function isPasswordSignInConfigured(): boolean {
  return isIdentityToolkitConfigured()
}

// signed_in: 2要素目なしで通った（MFA を登録していないアカウント）/ mfa_required: パスワードは合っていて、SMS の2要素目が要る
export type PasswordSignInSuccess =
  | { kind: 'signed_in'; idToken: string }
  | { kind: 'mfa_required'; mfaPendingCredential: string; mfaEnrollmentId: string; phoneHint: string }

// invalid_credentials: メールアドレスかパスワードが違う / firebase_throttled: Firebase 自身が試行を止めた（失敗として数える）。
// code は Firebase のエラーコード（ログで、どこで断ったかを追うため。値は利用者の入力を含まない）
export type PasswordSignInFailure = { kind: 'invalid_credentials' | 'firebase_throttled'; code: string }

export async function signInWithPassword(email: string, password: string): Promise<Result<PasswordSignInSuccess, PasswordSignInFailure>> {
  const res = await callIdentityToolkit('v1/accounts:signInWithPassword', { email, password, returnSecureToken: true }, 'Password sign-in')

  if (res.ok) {
    const signedIn = SignedInSchema.safeParse(res.body)
    if (signedIn.success) return { success: true, value: { kind: 'signed_in', idToken: signedIn.data.idToken } }
    const mfa = MfaRequiredSchema.safeParse(res.body)
    // 2要素目は電話だけを使う（TOTP などは登録しない）。電話の登録がなければ、確かめようがないので障害として断る
    const phone = mfa.success ? mfa.data.mfaInfo.find((info) => info.phoneInfo !== undefined) : undefined
    if (!mfa.success || phone === undefined) throw new InfraError('AUTH_UNAVAILABLE', 'Password sign-in returned neither idToken nor a phone second factor (status 200)')
    return {
      success: true,
      value: { kind: 'mfa_required', mfaPendingCredential: mfa.data.mfaPendingCredential, mfaEnrollmentId: phone.mfaEnrollmentId, phoneHint: phone.phoneInfo ?? '' },
    }
  }

  const { code, status } = res
  if (CREDENTIAL_ERRORS.has(code)) return { success: false, error: { kind: 'invalid_credentials', code } }
  // Firebase 自身の制限。攻撃者がこれを起こし続けても、こちらの制限で止まるよう、失敗として数える（障害にしない）
  if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER') return { success: false, error: { kind: 'firebase_throttled', code } }
  // API キーの誤り、5xx など
  throw new InfraError('AUTH_UNAVAILABLE', `Password sign-in failed: ${code} (status ${status})`)
}
