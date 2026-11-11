// ログインを許す端末。旅館の PC（Windows）の Chrome か Edge だけ（docs/NormalOperation.md「端末」「ブラウザ」）。
// User-Agent は送る側が自由に書けるので、うっかり別の端末で使ったことを止めるためのもの。まねる攻撃者は止められない
export const LOGIN_ALLOWED_OS = ['windows'] as const
export const LOGIN_ALLOWED_BROWSERS = ['chrome', 'edge'] as const

// 1アカウント1セッション: ログイン API が Firebase のユーザーのカスタムクレームに書く、最後のログインの時刻（auth_time、秒）。
// verifySession が Session Cookie の auth_time と比べ、違えば前のセッションとして断る
export const SESSION_AUTH_TIME_CLAIM = 'sessionAuthTime'
