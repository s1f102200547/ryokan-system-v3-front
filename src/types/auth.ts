/*
認証したときのレスポンスの型定義
成功時は userId、失敗時は reason が必ず返ってくる

{ success: false; reason: 'invalid_credentials' | 'account_locked' | 'rate_limited' } などと後から拡張可能
*/
export type LoginResult =
  | { success: true; userId: string }
  | { success: false; reason: 'invalid_credentials' }
