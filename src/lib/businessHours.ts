import { API_GRACE_MINUTES_AFTER_CLOSE, BUSINESS_HOURS_END_JST, BUSINESS_HOURS_START_JST } from '@/constants/date'

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
