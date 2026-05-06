import type { RoomNumber } from '@/types/room'

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
}

// a_tax_table の 3フィールド独立更新ペイロード
export type ATaxPatch = Partial<{
  a_tax_received: boolean
  a_tax_received_by_staff_name: string  // 徴収したスタッフ名
  a_tax_closing_staff_name: string      // 締めスタッフ名（金庫照合確認者）
}>

// モーダルの保存ペイロード（部分更新）
// check_out_date変更時は夜数連動フィールドも resizeNightFields で同時更新すること
export type ReservationPatch = Partial<{
  guest_name: string
  room: RoomNumber
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
  a_tax_closing_staff_name: string
  check_in_staff_name: string
  country: string
  city: string
  age_groups: string[]   // 長さ = adult_count（夜数とは独立）
  group_type: string
  purpose: string
  tourism_type: string
  profession: string
  other_note: string
}>
