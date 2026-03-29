// 外部サービスを抽象化
// Promise: 認証は外部通信になるため非同期
// "login() → Firebase直接呼ぶ"ではなく"login() → AuthProvider（インターフェース）"にすることでFirebase auth, Mockテスト など分岐可能にする
// infraを実装してから再度確認する必要あり
export interface AuthProvider {
  authenticate(
    email: string,
    password: string,
  ): Promise<{ success: true; userId: string } | { success: false }>
}
