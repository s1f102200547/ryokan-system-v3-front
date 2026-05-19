export const ROOM_MAP: Record<string, string> = {
  '21': '㉑',
  '22': '㉒',
  '31': '㉛',
  '32': '㉜',
  '42': '㊷',
  '43': '㊸',
  '61': '61',
}

// CheckInTime 列
export const VALID_ARRIVAL_TIMES = [
  '13:00以前', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00以降', '未定',
] as const
export type ValidArrivalTime = (typeof VALID_ARRIVAL_TIMES)[number]

// 夕方露天風呂 列（16:00〜22:00、1時間刻み）
export const OPEN_AIR_TIMES_EVENING = [
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
] as const

// 朝露天風呂 列
export const OPEN_AIR_TIMES_MORNING = [
  '7:30', '8:00', '8:30', '9:00', '9:30',
] as const

// 夕食 列（'PENDING' は '未定' キーに対応）
export const DINNER_TIME_KEYS = [
  '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '未定',
] as const

// 朝食時刻キー（a=上段, b=下段）
export const BREAKFAST_A_TIMES = ['7:30a', '8:00a', '8:30a', '9:00a', '9:30a'] as const
export const BREAKFAST_B_TIMES = ['7:30b', '8:00b', '8:30b', '9:00b', '9:30b'] as const

// 朝食ヘッダー列（時刻表示用）
export const BREAKFAST_HEADER_TIMES = ['7:30', '8:00', '8:30', '9:00', '9:30'] as const
