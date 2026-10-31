import { BUSINESS_HOURS_END_JST, BUSINESS_HOURS_START_JST } from '@/constants/date'

// 本番の時間帯制限（6:00〜23:00 JST）の外か。画面（proxy.ts）とログイン API（BugHunting.md #14）で共通に使う
export function isOutsideBusinessHours(nowMs: number = Date.now()): boolean {
  const nowJST = new Date(nowMs + 9 * 60 * 60 * 1000)
  const minuteOfDay = nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes()
  return minuteOfDay < BUSINESS_HOURS_START_JST * 60 || minuteOfDay >= BUSINESS_HOURS_END_JST * 60
}
