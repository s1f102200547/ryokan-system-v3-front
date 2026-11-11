import { z } from 'zod'
import { InfraError } from '@/types/errors'
import type { Result } from '@/types/result'

// パスワードの確認（Firebase Auth の REST API、accounts:signInWithPassword）。
// ブラウザから Firebase を呼ばないため、サーバーが確かめる。API キーはサーバーだけが持つ（FIREBASE_AUTH_API_KEY）。
// パスワード・リクエストの body・応答の body は、ログにも例外のメッセージにも入れない。載せるのはエラーコードと HTTP status だけ

const TIMEOUT_MS = 10_000

// メールアドレスかパスワードが違う（利用者のせい。数えて 401 にする）。
// 本番はメールアドレスの列挙対策で INVALID_LOGIN_CREDENTIALS にまとまる。Emulator は INVALID_PASSWORD・EMAIL_NOT_FOUND を返す
const CREDENTIAL_ERRORS = new Set([
  'INVALID_LOGIN_CREDENTIALS',
  'INVALID_PASSWORD',
  'EMAIL_NOT_FOUND',
  'USER_DISABLED',
  'INVALID_EMAIL',
])

const SuccessSchema = z.object({ idToken: z.string().min(1) })
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) })

// Emulator の接続先があれば Emulator（起動ガードが、本番では Emulator 系の変数を許さない）。
// Auth Emulator はどんな API キーでも受け付けるので、開発・テストでは FIREBASE_AUTH_API_KEY を設定しなくてよい
function endpoint(): string | null {
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const apiKey = process.env.FIREBASE_AUTH_API_KEY || (emulatorHost ? 'demo-api-key' : undefined)
  if (!apiKey) return null
  const base = emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com'
  return `${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`
}

// "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account..." の先頭の語だけ（説明の文は載せない）
function errorCode(message: string): string {
  return message.split(/[\s:]/, 1)[0] ?? ''
}

export async function signInWithPassword(email: string, password: string): Promise<Result<{ idToken: string }, 'invalid_credentials'>> {
  const url = endpoint()
  if (url === null) throw new InfraError('AUTH_UNAVAILABLE', 'FIREBASE_AUTH_API_KEY is not set')

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    // 通信の失敗・タイムアウト。fetch の例外にリクエストの body は入らない
    throw new InfraError('AUTH_UNAVAILABLE', 'Password sign-in request failed', e)
  }

  const body: unknown = await res.json().catch(() => null)
  if (res.ok) {
    const parsed = SuccessSchema.safeParse(body)
    // idToken がない成功（2要素目が要る mfaPendingCredential など）は、まだ扱えない
    if (!parsed.success) throw new InfraError('AUTH_UNAVAILABLE', `Password sign-in returned no idToken (status ${res.status})`)
    return { success: true, value: { idToken: parsed.data.idToken } }
  }

  const parsedError = ErrorSchema.safeParse(body)
  const code = parsedError.success ? errorCode(parsedError.data.error.message) : 'UNKNOWN'
  if (CREDENTIAL_ERRORS.has(code)) return { success: false, error: 'invalid_credentials' }
  // TOO_MANY_ATTEMPTS_TRY_LATER（Firebase 自身の制限。全員がサーバーの IP に見えるので障害として知らせる）、API キーの誤り、5xx など
  throw new InfraError('AUTH_UNAVAILABLE', `Password sign-in failed: ${code} (status ${res.status})`)
}
