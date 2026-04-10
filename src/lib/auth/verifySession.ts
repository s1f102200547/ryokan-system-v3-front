import { adminAuth } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'

// firebase-admin の FirebaseError は値ではなく型なので instanceof が使えない
function isFirebaseAuthError(e: unknown): e is { code: string } {
  return (
    typeof e === 'object' &&  // error(e)の型チェック
    e !== null &&   // error(e)の存在チェック
    'code' in e &&  // error(e)にcodeプロパティがあるかの存在チェック
    typeof (e as { code: unknown }).code === 'string' &&
    String((e as { code: unknown }).code).startsWith('auth/') // ex. auth/session-cookie-expired
  )
}

export async function verifySession(
  cookieValue: string | undefined,
): Promise<{ uid: string } | null> {
  if (!cookieValue) return null

  try {
    const decoded = await adminAuth.verifySessionCookie(cookieValue, true)
    return { uid: decoded.uid } // セッションクッキーが有効(=ログイン中)ならuserIdを返す
  } catch (e) {
    if (isFirebaseAuthError(e)) { // 既知のエラーの場合
      // auth/session-cookie-expired, auth/session-cookie-revoked, auth/invalid-session-cookie 等
      // → 未認証として扱う（インフラ障害ではない）
      return null
    }
    throw new InfraError('AUTH_UNAVAILABLE', 'Session verification failed', e)
  }
}
