import { FirebaseError } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/client'
import { InfraError } from '@/types/errors'
import type { AuthProvider } from '@/domain/ports/authProvider'

// 認証失敗（ビジネス結果）として扱う Firebase エラーコード
// これ以外は AUTH_UNAVAILABLE（インフラ障害）として throw する
const CREDENTIAL_ERROR_CODES = new Set([
  'auth/wrong-password',
  'auth/invalid-credential', // Firebase v9+ の統合コード
  'auth/user-not-found',
  'auth/invalid-email',
])

// Domain層 の ports/ のAuthProviderインターフェースを Firebase で差し替え。
export const firebaseAuthProvider: AuthProvider = {
  async authenticate(email, password) {
    try {
      const credential = await signInWithEmailAndPassword(
        getAuth(firebaseApp),
        email,
        password,
      )
      return { success: true, userId: credential.user.uid }
    } catch (e) {
      if (e instanceof FirebaseError) {
        if (CREDENTIAL_ERROR_CODES.has(e.code)) {
          // 認証失敗はビジネスロジックで処理する（InfraError ではない）
          return { success: false }
        }
        // auth/network-request-failed, auth/too-many-requests, auth/internal-error 等
        throw new InfraError('AUTH_UNAVAILABLE', `Firebase Auth error: ${e.code}`, e)
      }
      throw new InfraError('AUTH_UNAVAILABLE', 'Unexpected auth error', e)
    }
  },
}
