export const DATE_RANGE_PAST_DAYS = 100
export const DATE_RANGE_FUTURE_DAYS = 365

// 本番で画面とログインを使える時間帯（JST、時）。開始は含み、終了は含まない。
// Session Cookie も終了時刻に切れる（ただし Firebase の最低値が 5 分なので、22:55 以降のログインでは最長 23:05）
export const BUSINESS_HOURS_START_JST = 6
export const BUSINESS_HOURS_END_JST = 23
// ログイン以外の API は、終了時刻の後もこの分だけ使える（6:00〜23:05。requireSession）。
// 22:55 以降のログインの Session Cookie が最長 23:05 まで生きるのと合わせる。23:00 の直前に押した保存が少し遅れて届いても通す
export const API_GRACE_MINUTES_AFTER_CLOSE = 5
// 終了時刻のこの分前から、ログインの1段目（パスワード → SMS）を断る（22:55〜23:00）。この間に SMS を送ると、
// コードを打つ前に 23:00 になり、SMS を1通無駄にしていた（F-10）。SMS のコードの途中の状態の期限（MFA_PENDING_TTL_MS、5分）と同じ値。
// 22:55 より前に送った SMS の途中の状態は 23:00 までに切れる（tests/unit/constraints/ が突き合わせる）
export const LOGIN_CUTOFF_MINUTES_BEFORE_CLOSE = 5
