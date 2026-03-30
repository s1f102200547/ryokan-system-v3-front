import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/client'
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
    } catch {
      return { success: false }
    }
  },
}
