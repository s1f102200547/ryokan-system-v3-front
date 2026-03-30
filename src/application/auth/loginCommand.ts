import { login } from '@/domain/auth/loginPolicy' // 純粋なドメインロジック（外部依存なし）
import { firebaseAuthProvider } from '@/infra/auth/firebaseAuthProvider' // Firebaseの外部連携を使う“具体実装”
import type { LoginResult } from '@/types/auth'

/*
「どのAuthProviderを使うか」をここで決めている

Route Handler / UI
        ↓
loginCommand ← ここ
        ↓
login（ドメイン）
        ↓
firebaseAuthProvider（インフラ）
*/
export async function loginCommand(credentials: {
  email: string
  password: string
}): Promise<LoginResult> {
  return login(credentials, firebaseAuthProvider) //domain関数(infra関数)
}
