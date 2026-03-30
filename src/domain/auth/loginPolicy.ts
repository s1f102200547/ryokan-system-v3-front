import type { AuthProvider } from '@/domain/ports/authProvider'
import type { LoginResult } from '@/types/auth'

/*
ログインの純粋なビジネスロジック（ルール）
Firebaseコード・DBコード・HTTPなどの外部通信は含めない
後から if (isRateLimited) {} などを追加可能

処理フロー
① 認証依頼
   ↓
② 成功？
   ├ NO → invalid_credentials
   └ YES → userId返す
*/
export async function login(
  credentials: { email: string; password: string },
  authProvider: AuthProvider,
): Promise<LoginResult> {
  const result = await authProvider.authenticate(credentials.email, credentials.password)
  if (!result.success) return { success: false, reason: 'invalid_credentials' }
  return { success: true, userId: result.userId }
}
