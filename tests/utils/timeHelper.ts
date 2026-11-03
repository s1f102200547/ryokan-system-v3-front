import { vi } from 'vitest'

// JST の日時（'2026-05-20T06:00'）を、実行環境の TZ に関係なく同じ瞬間として固定する
export function setNowJST(localJST: string): void {
  vi.setSystemTime(new Date(`${localJST}:00+09:00`))
}

// JST の時刻の境界。6:00 / 23:00 は本番の時間帯制限、0:00〜9:00 は UTC では前日
export const JST_BOUNDARY_TIMES = ['00:00', '05:59', '06:00', '08:59', '09:00', '22:54', '22:56', '23:00', '23:59'] as const
