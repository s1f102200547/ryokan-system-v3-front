export type Reservation = {
  id: string
  check_in_date: string // YYYY-MM-DD（infra層で YYYY/MM/DD から変換済み）
  check_out_date: string // YYYY-MM-DD
  adult_count: number
  child_count: number
  room: string | null
  cancel: number // 0 | 1
  late_out?: boolean
}
