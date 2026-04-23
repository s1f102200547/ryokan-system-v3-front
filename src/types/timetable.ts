/**
 * GET /api/timetable?date=YYYY-MM-DD のレスポンス型
 *
 * checkInSlots      : 到着時刻 → ラベル配列
 *                     キー = VALID_ARRIVAL_TIMES の時刻 or 'OTHER'（範囲外時刻）
 * stayingGuestLabels: 2泊以上の全滞在ゲストを横並び表示（日付-arrival間）
 *                     形式: {部屋マーク}-{大人数}[({子供数})]({現在泊目}/{全泊数}泊目)
 * eveningBathSlots  : 夕方露天風呂 時刻 → 部屋マーク配列
 * dinnerSlots       : 夕食時刻 → ラベル配列（NONE/CANCEL は除外、PENDING → '未定'）
 * guestInfoRows     : 部屋番号 → timetable_info（空室なら '空室'）
 * breakfastSlots    : 朝食時刻キー → 部屋マーク配列
 * checkoutRooms     : 翌日チェックアウトの部屋マーク配列（CheckoutNotice 用）
 * morningBathSlots  : 朝露天風呂 時刻 → 部屋マーク配列
 * lateCheckoutRooms : 翌日レイトアウトの部屋マーク配列
 */
export type TimetableData = {
  checkInSlots: Record<string, string[]>
  stayingGuestLabels: string[]
  eveningBathSlots: Record<string, string[]>
  dinnerSlots: Record<string, string[]>
  guestInfoRows: Record<string, string>
  breakfastSlots: Record<string, string[]>
  checkoutRooms: string[]
  morningBathSlots: Record<string, string[]>
  lateCheckoutRooms: string[]
}
