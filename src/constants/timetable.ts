export const ROOM_MAP: Record<string, string> = {
  '21': '㉑',
  '22': '㉒',
  '31': '㉛',
  '32': '㉜',
  '42': '㊷',
  '43': '㊸',
  '61': '61',
}

// CheckInTime 列（15:00〜22:00、1時間刻み）
export const VALID_ARRIVAL_TIMES = [
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
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
  '未定', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00',
] as const
