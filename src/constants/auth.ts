// ログインを許す端末。旅館の PC（Windows）の Chrome か Edge だけ（docs/NormalOperation.md「端末」「ブラウザ」）。
// User-Agent は送る側が自由に書けるので、うっかり別の端末で使ったことを止めるためのもの。まねる攻撃者は止められない
export const LOGIN_ALLOWED_OS = ['windows'] as const
export const LOGIN_ALLOWED_BROWSERS = ['chrome', 'edge'] as const
