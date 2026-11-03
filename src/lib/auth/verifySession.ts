import { adminAuth } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'

// Session Cookie そのものが無効なことを表すコード（未ログインとして 401 にする）
const INVALID_SESSION_CODES = new Set([
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/user-disabled',
  'auth/user-not-found', // checkRevoked で、ユーザーが削除されていた
])

// firebase-admin（13.10 で確認）は、不正な Cookie にも Google の公開鍵の取得失敗（障害）にも auth/argument-error を返す。
// Cookie の中身が原因のメッセージは次のどちらかで始まる（src/lib/auth/idTokenError.ts と同じ考え方）
const INVALID_SESSION_MESSAGE_PREFIXES = ['Decoding Firebase session cookie failed', 'Firebase session cookie ']

function isInvalidSessionError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const { code, message } = e as { code?: unknown; message?: unknown }
  if (typeof code !== 'string') return false
  if (INVALID_SESSION_CODES.has(code)) return true
  return (
    code === 'auth/argument-error' &&
    typeof message === 'string' &&
    INVALID_SESSION_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))
  )
}

// 有効なら uid、未ログイン（Cookie がない・無効）なら null。
// Firebase Auth の障害（接続できない・内部エラーなど）は AUTH_UNAVAILABLE を投げる。
// 以前は auth/ で始まるコードをすべて未ログインにしていたため、Auth の内部障害でもログイン画面に戻され、通知されなかった
export async function verifySession(
  cookieValue: string | undefined,
): Promise<{ uid: string } | null> {
  if (!cookieValue) return null

  try {
    const decoded = await adminAuth.verifySessionCookie(cookieValue, true)
    return { uid: decoded.uid }
  } catch (e) {
    if (isInvalidSessionError(e)) return null
    throw new InfraError('AUTH_UNAVAILABLE', 'Session verification failed', e)
  }
}
