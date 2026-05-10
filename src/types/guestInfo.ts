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
