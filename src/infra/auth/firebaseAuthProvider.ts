import { FirebaseError } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/client'
import { CREDENTIAL_ERROR_CODES } from '@/lib/firebase/credentialErrorCodes'
import { InfraError } from '@/types/errors'
import type { AuthProvider } from '@/domain/ports/authProvider'

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
