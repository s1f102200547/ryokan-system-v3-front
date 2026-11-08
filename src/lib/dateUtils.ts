export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// YYYY-MM-DD の形で、実在する日付か（2026-02-30・2026-13-01 などは false）。
// API の DateSchema と、画面の ?date= の読み取りで同じ判定を使う
export function isRealDate(v: string): boolean {
  if (!DATE_REGEX.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d
}

export function getTodayJST(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

export function dateDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000
}

// YYYY-MM-DD → 操作履歴（mail_memo）の月日（0 埋めなし）
export function toMonthDay(dateStr: string): { month: string; day: string } {
  const [, month, day] = dateStr.split('-').map(Number)
  return { month: String(month), day: String(day) }
}

export function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number)
  return `${parts[1]}/${parts[2]}`
}

export function formatDiffLabel(today: string, selected: string): string {
  const diff = dateDiff(today, selected)
  if (diff === 0) return '今日'
  if (diff === 1) return '明日'
  if (diff === -1) return '昨日'
  if (diff > 0) return `${diff}日後`
  return `${Math.abs(diff)}日前`
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day + days)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}
