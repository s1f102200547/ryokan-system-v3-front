// ログインを許す端末。旅館の PC（Windows）の Chrome か Edge だけ（docs/NormalOperation.md「端末」「ブラウザ」）。
// User-Agent は送る側が自由に書けるので、うっかり別の端末で使ったことを止めるためのもの。まねる攻撃者は止められない
export const LOGIN_ALLOWED_OS = ['windows'] as const
export const LOGIN_ALLOWED_BROWSERS = ['chrome', 'edge'] as const

// 1アカウント1セッション: ログイン API が Firebase のユーザーのカスタムクレームに書く、最後のログインの時刻（auth_time、秒）。
// verifySession が Session Cookie の auth_time と比べ、違えば前のセッションとして断る
export const SESSION_AUTH_TIME_CLAIM = 'sessionAuthTime'

// ログインの失敗回数の制限（iPhone のように、続けて失敗するほど長く止める）。メールアドレスごと・IP ごとに同じ表で数える。
// 止めている間はパスワードを確かめず、回数も足さない。成功、または最後の失敗から LOGIN_FAILURE_RESET_MS で 0 に戻る
const MINUTE_MS = 60 * 1000
export const LOGIN_LOCK_STEPS: readonly { failures: number; lockMs: number }[] = [
  { failures: 3, lockMs: 1 * MINUTE_MS },
  { failures: 4, lockMs: 5 * MINUTE_MS },
  { failures: 5, lockMs: 15 * MINUTE_MS },
  { failures: 6, lockMs: 60 * MINUTE_MS }, // 6回目以降は、失敗のたびに1時間
]
export const LOGIN_FAILURE_RESET_MS = 24 * 60 * MINUTE_MS

// ログインの入力の長さ。ログイン画面の入力欄（minLength・maxLength）と API の Zod で同じ値を使う。
// 上限: メールアドレスは RFC 5321 の上限、パスワードは openssl で作った値より十分長い
export const LOGIN_EMAIL_MIN_LENGTH = 3
export const LOGIN_EMAIL_MAX_LENGTH = 254
export const LOGIN_PASSWORD_MIN_LENGTH = 3
export const LOGIN_PASSWORD_MAX_LENGTH = 256
