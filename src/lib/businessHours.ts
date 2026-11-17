import { API_GRACE_MINUTES_AFTER_CLOSE, BUSINESS_HOURS_END_JST, BUSINESS_HOURS_START_JST, LOGIN_CUTOFF_MINUTES_BEFORE_CLOSE } from '@/constants/date'

function minuteOfDayJST(nowMs: number): number {
  const nowJST = new Date(nowMs + 9 * 60 * 60 * 1000)
  return nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes()
}

// 本番の時間帯制限（6:00〜23:00 JST）の外か。画面（proxy.ts）とログイン API で共通に使う
export function isOutsideBusinessHours(nowMs: number = Date.now()): boolean {
  const minute = minuteOfDayJST(nowMs)
  return minute < BUSINESS_HOURS_START_JST * 60 || minute >= BUSINESS_HOURS_END_JST * 60
}

// ログイン以外の API の時間帯（6:00〜23:05 JST）の外か。requireSession（src/lib/api/routeHelpers.ts）が使う
export function isOutsideApiHours(nowMs: number = Date.now()): boolean {
  const minute = minuteOfDayJST(nowMs)
  return minute < BUSINESS_HOURS_START_JST * 60 || minute >= BUSINESS_HOURS_END_JST * 60 + API_GRACE_MINUTES_AFTER_CLOSE
}

// 終了の直前（22:55〜23:00 JST）か。ログインの1段目だけが使う（SMS を送ってもコードを打つ前に時間外になる）
export function isLoginClosingSoon(nowMs: number = Date.now()): boolean {
  const minute = minuteOfDayJST(nowMs)
  const close = BUSINESS_HOURS_END_JST * 60
  return minute >= close - LOGIN_CUTOFF_MINUTES_BEFORE_CLOSE && minute < close
}
