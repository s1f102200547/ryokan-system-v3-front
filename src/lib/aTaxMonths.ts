// 宿泊税テーブルで見られる月は、JST の今月と先月だけ。
// 画面の切り替えと API の入口検証が共通で使う（API で他の月を読ませない。Session Cookie を盗まれても過去の宿泊客を一覧できないように）

export type YearMonth = { year: number; month: number }

// today: YYYY-MM-DD（JST）
export function aTaxTableMonths(today: string): { current: YearMonth; previous: YearMonth } {
  const [year, month] = today.split('-').map(Number)
  return {
    current: { year, month },
    previous: month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 },
  }
}

export function isATaxTableMonth(target: YearMonth, today: string): boolean {
  const { current, previous } = aTaxTableMonths(today)
  return [current, previous].some((m) => m.year === target.year && m.month === target.month)
}
