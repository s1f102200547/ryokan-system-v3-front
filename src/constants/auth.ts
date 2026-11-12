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

// 試行中の札（パスワードを確かめている最中の試行）。札は確かめ終わったら外すが、外し忘れてもこの時間で自然に消える
export const LOGIN_PENDING_TTL_MS = 15_000
// 試行中の札が埋まっているとき（同時の試行）、ブラウザに「少し待ってもう一度」と返す時間
export const LOGIN_BUSY_RETRY_MS = 1_000

// SMS の2要素目（docs/NormalOperationPlan.md の C）。
// コードの桁数。ログイン画面の入力欄と verify API の Zod で同じ値を使う
export const MFA_CODE_LENGTH = 6
// パスワードが合ってから、コードを打ち終えるまでの時間。途中の状態（Firestore の mfaPending）と Cookie の寿命
export const MFA_PENDING_TTL_MS = 5 * MINUTE_MS
// 途中の状態の ID を運ぶ Cookie。ログイン API と verify API にだけ送られる
export const MFA_PENDING_COOKIE = 'mfa_pending'
export const MFA_PENDING_COOKIE_PATH = '/api/auth/login'
// 1アカウントが1日（JST）に送れる SMS の数。セッションは毎日 23:00 に切れるので、普段は1日1通。
// 不正な大量送信（SMS pumping）で料金を取られないための上限。超えたら 429 と Slack
export const MFA_SMS_DAILY_LIMIT = 10
