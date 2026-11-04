export const DATE_RANGE_PAST_DAYS = 100
export const DATE_RANGE_FUTURE_DAYS = 365

// 本番で画面とログインを使える時間帯（JST、時）。開始は含み、終了は含まない。
// Session Cookie も終了時刻に切れる（ただし Firebase の最低値が 5 分なので、22:55 以降のログインでは最長 23:05）
export const BUSINESS_HOURS_START_JST = 6
export const BUSINESS_HOURS_END_JST = 23
