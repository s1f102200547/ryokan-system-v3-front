// Firebase Client SDK の認証失敗エラーコード（ビジネス結果として扱うもの）
// これ以外は AUTH_UNAVAILABLE（インフラ障害）として扱う
export const CREDENTIAL_ERROR_CODES = new Set([
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-credential', // Firebase v9+ の統合コード
  'auth/invalid-email',
])
