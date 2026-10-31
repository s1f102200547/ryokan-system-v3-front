import type { RoomNumber } from '@/types/room'

export type GuestInfoToggle = 'openAirBath' | 'dinner' | 'checkIn' | 'breakfast'

export type BookingSite = 'chillnn' | 'booking.com' | 'expedia' | 'other'

export type MailMemoEntry = {
  month: string  // "1"〜"12"
  day: string    // "1"〜"31"
  name: string
  summary: string
  text: string
  source: string // 'booking' | 'expedia' | 'webmail' | 'システム'
}

export type NewReservationInput = {
  check_in_date: string  // YYYY-MM-DD（selectedDateから）
  check_out_date: string // YYYY-MM-DD
  room: RoomNumber
  adult_count: number
  child_count: number
  guest_name: string
  booking_site: BookingSite
  add_reason: string     // Slack通知にのみ使用、Firestoreには保存しない
  staff_name: string
}

// a_tax_table の per-reservation 更新ペイロード（checkbox + 徴収スタッフ名）
// 締めスタッフ名（safeBalanceChecker）は daily/{YYYY-MM-DD} に保存するため別途処理
export type ATaxPatch = Partial<{
  a_tax_received: boolean
  a_tax_received_by_staff_name: string
}>

// モーダルの保存ペイロード（部分更新）
// check_out_date変更時は夜数連動フィールドも resizeNightFields で同時更新すること
export type ReservationPatch = Partial<{
  guest_name: string
  room: RoomNumber | null
  adult_count: number
  child_count: number
  check_out_date: string
  arrival_time: string | null
  late_out: number
  dinner_time: string[]
  dinner_info: string[]
  breakfast_time: (string | null)[]
  open_air_bath_time: (string | null)[]
  timetable_info: string[]
  mail_memo: MailMemoEntry[]
  a_tax_received: boolean
  a_tax_received_by_staff_name: string
  check_in_staff_name: string
  country: string | null
  city: string
  age_groups: (string | null)[]  // 長さ = adult_count（夜数とは独立）、未選択要素 → null
  group_type: string | null
  purpose: string | null
  tourism_type: string | null
  profession: string
  other_note: string
}>

// 予約の更新を検査するために、DB の今の値から読む項目（日付は YYYY-MM-DD）
// check_out_date は壊れている（C/I 以前）ことがある
export type StayFacts = {
  check_in_date: string
  check_out_date: string
  adult_count: number
}

export type ReservationPatchViolation = {
  code:
    | 'CHECK_OUT_NOT_AFTER_CHECK_IN'   // 更新後の C/O が C/I 以前
    | 'TOO_MANY_NIGHTS'                // 更新後の泊数が MAX_NIGHTS を超える
    | 'NIGHT_FIELDS_REQUIRED'          // 泊数が変わるのに泊別配列が揃っていない
    | 'NIGHT_FIELD_LENGTH_MISMATCH'    // 泊別配列の長さが更新後の泊数と違う
    | 'AGE_GROUPS_REQUIRED'            // 大人の人数が変わるのに age_groups がない
    | 'AGE_GROUPS_LENGTH_MISMATCH'     // age_groups の長さが更新後の大人の人数と違う
  field?: keyof ReservationPatch
}

export type UpdateReservationFailure =
  | { kind: 'NOT_FOUND' }
  | { kind: 'INVALID'; violations: ReservationPatchViolation[] }

// キャンセル・復活で、予約がすでにその状態だった（古い画面からの操作や2人同時の操作。BugHunting.md #27）
export type CancelStateFailure = { kind: 'ALREADY_IN_STATE' }
