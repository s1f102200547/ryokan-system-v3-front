import type { RoomNumber } from '@/types/room'

export type Reservation = {
  id: string
  check_in_date: string // YYYY-MM-DD（infra層で YYYY/MM/DD から変換済み）
  check_out_date: string // YYYY-MM-DD
  adult_count: number
  child_count: number
  room: RoomNumber | null
  cancel: number // 0 | 1
  late_out?: number // 0 | 1
  guest_name: string                   // 欠損 or 不正 → ""
  arrival_time: string | null          // 定義外 or 欠損 → null
  dinner_time: string[]                // 要素不正 → "NONE"、欠損 → []
  breakfast_time: (string | null)[]    // 要素不正 → null、欠損 → []
  open_air_bath_time: (string | null)[] // 要素不正 → null、欠損 → []
  timetable_info: string[]             // 要素非文字列 → ""、欠損 → []
}
