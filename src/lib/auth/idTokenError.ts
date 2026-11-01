// verifyIdToken が投げたエラーが「トークンの不正（ログイン失敗。401）」かを判定する。
// それ以外は Firebase Auth 側の障害として 503 + 通知にする。

// トークンそのものが無効なことを表すコード
const INVALID_TOKEN_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
])

// firebase-admin（13.10 で確認）は、不正なトークンにも Google の公開鍵の取得失敗（障害）にも
// auth/argument-error を返す。トークンの中身が原因のメッセージは次のどちらかで始まる。
// 公開鍵の取得失敗は "Error fetching ..." や接続エラーの生のメッセージになるので、ここに当たらず障害側に倒れる（BugHunting.md #2）
const INVALID_TOKEN_MESSAGE_PREFIXES = ['Decoding Firebase ID token failed', 'Firebase ID token ']

export function isInvalidIdTokenError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const { code, message } = e as { code?: unknown; message?: unknown }
  if (typeof code !== 'string') return false
  if (INVALID_TOKEN_CODES.has(code)) return true
  return (
    code === 'auth/argument-error' &&
    typeof message === 'string' &&
    INVALID_TOKEN_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix))
  )
}
