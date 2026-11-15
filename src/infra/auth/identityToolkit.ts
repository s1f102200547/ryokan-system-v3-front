import { z } from 'zod'
import { InfraError } from '@/types/errors'

// Firebase Auth（Identity Toolkit）の REST API を呼ぶ共通の部分。パスワードの確認（passwordSignIn.ts）と SMS の2要素目（mfaSignIn.ts）が使う。
// ブラウザから Firebase を呼ばないため、サーバーが呼ぶ。API キーはサーバーだけが持つ（FIREBASE_AUTH_API_KEY）。
// リクエストの body・応答の body（パスワード、コード、mfaPendingCredential、sessionInfo、idToken）は、ログにも例外のメッセージにも入れない。
// 載せるのはエラーコードと HTTP status だけ

const TIMEOUT_MS = 10_000

// v1: accounts:signInWithPassword / v2: accounts/mfaSignIn:start・finalize
export type IdentityToolkitMethod = 'v1/accounts:signInWithPassword' | 'v2/accounts/mfaSignIn:start' | 'v2/accounts/mfaSignIn:finalize'

const ErrorSchema = z.object({ error: z.object({ message: z.string() }) })

// Emulator の接続先があれば Emulator（起動ガードが、本番では Emulator 系の変数を許さない）。
// Auth Emulator はどんな API キーでも受け付けるので、開発・テストでは FIREBASE_AUTH_API_KEY を設定しなくてよい
function endpoint(method: IdentityToolkitMethod): string | null {
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const apiKey = process.env.FIREBASE_AUTH_API_KEY || (emulatorHost ? 'demo-api-key' : undefined)
  if (!apiKey) return null
  const base = emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com'
  return `${base}/${method}?key=${encodeURIComponent(apiKey)}`
}

// API キーがあり、Identity Toolkit を呼べるか
export function isIdentityToolkitConfigured(): boolean {
  return endpoint('v1/accounts:signInWithPassword') !== null
}

// "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account..." の先頭の語だけ（説明の文は載せない）
function errorCode(message: string): string {
  return message.split(/[\s:]/, 1)[0] ?? ''
}

// ok: 応答の body（検証は呼び出し側）/ error: Firebase のエラーコード（JSON でなければ UNKNOWN）と status
export type IdentityToolkitResponse =
  | { ok: true; body: unknown }
  | { ok: false; code: string; status: number }

// label は例外のメッセージに使う（"Password sign-in" など）
export async function callIdentityToolkit(method: IdentityToolkitMethod, payload: object, label: string): Promise<IdentityToolkitResponse> {
  const url = endpoint(method)
  if (url === null) throw new InfraError('AUTH_UNAVAILABLE', 'FIREBASE_AUTH_API_KEY is not set')

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    // 通信の失敗・タイムアウト。fetch の例外にリクエストの body は入らない
    throw new InfraError('AUTH_UNAVAILABLE', `${label} request failed`, e)
  }

  const body: unknown = await res.json().catch(() => null)
  if (res.ok) return { ok: true, body }
  const parsedError = ErrorSchema.safeParse(body)
  return { ok: false, code: parsedError.success ? errorCode(parsedError.data.error.message) : 'UNKNOWN', status: res.status }
}
