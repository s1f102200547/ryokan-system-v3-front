// 形のレポートで「破損日付」として数える基準。値は変えず、数えるだけに使う

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// guestInfoV2.check_in_date / check_out_date: YYYY/MM/DD
export function isValidSlashDate(value: string): boolean {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value)
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

// dailyInfo のドキュメント ID / dailyInfo.date: YYYY-MM-DD
export function isValidDashDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

// dailyInfo.updated_at / migrated_at: ISO 8601 の日時
export function isValidIsoDateTime(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (m === null) return false
  const [hour, minute, second] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)]
  const offsetOk = m[7] === 'Z' || (Number(m[8]) <= 23 && Number(m[9]) <= 59)
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3])) && hour <= 23 && minute <= 59 && second <= 59 && offsetOk
}

// guestInfoV2.mail_memo[].month + day: 月 "1"〜"12"、日 "1"〜"31"、その月に実在しうる日（2月は29日まで可）
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
export function isValidMonthDay(month: string, day: string): boolean {
  if (!/^(?:[1-9]|1[0-2])$/.test(month) || !/^(?:[1-9]|[12]\d|3[01])$/.test(day)) return false
  return Number(day) <= MAX_DAYS[Number(month) - 1]
}
