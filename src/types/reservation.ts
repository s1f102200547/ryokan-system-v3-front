import type { RoomNumber } from '@/types/room'
import type { BookingSite, MailMemoEntry } from '@/types/guestInfo'

export type Reservation = {
  id: string
  check_in_date: string  // YYYY-MM-DD（infra層で YYYY/MM/DD から変換済み）
  check_out_date: string // YYYY-MM-DD
  adult_count: number
  child_count: number
  room: RoomNumber | null
  cancel: number         // 0 | 1
  late_out: number       // 0 | 1（欠損 → 0）
  guest_name: string     // 欠損 or 不正 → ""
  arrival_time: string | null           // 定義外 or 欠損 → null
  dinner_time: string[]                 // 要素不正 → "NONE"、欠損 → []
  dinner_info: string[]                 // 要素非文字列 → ""、欠損 → []
  breakfast_time: (string | null)[]     // 要素不正 → null、欠損 → []
  open_air_bath_time: (string | null)[] // 要素不正 → null、欠損 → []
  timetable_info: string[]              // 要素非文字列 → ""、欠損 → []
  // --- guestInfo / a_tax_table 追加フィールド ---
  reservation_number: string            // 欠損 → ""（旧データ対応）
  booking_site: BookingSite             // 欠損 or 不正 → "other"
  mail_memo: MailMemoEntry[]            // 欠損 → []
  a_tax_received: boolean               // 欠損 → false
  a_tax_received_by_staff_name: string  // 徴収スタッフ名　欠損 → ""
  a_tax_closing_staff_name: string      // 締めスタッフ名（金庫照合確認者）欠損 → ""
  check_in_staff_name: string           // 欠損 → ""
  country: string                       // 欠損 → ""
  city: string                          // 欠損 → ""
  age_groups: string[]                  // 長さ = adult_count、欠損 → []
  group_type: string                    // 欠損 → ""
  purpose: string                       // 欠損 → ""
  tourism_type: string                  // 欠損 → ""
  profession: string                    // 欠損 → ""
  other_note: string                    // 欠損 → ""
}
