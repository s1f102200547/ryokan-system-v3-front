import { ROOM_NUMBERS } from '@/constants/room'
import type { Reservation } from '@/types/reservation'

export type RoomConflict = {
  room: string
  reservationIds: string[]
}

/**
 * 対象日の夜に、同じ部屋で有効な予約が2件以上あるものを返す（ダブルブッキング）。
 * 清掃ボード・タイムテーブルは1部屋1件を前提にしているため、2件目は表示されない。画面で気付けるようにする。
 * 対象日の夜を使う予約 = C/I ≦ 対象日 < C/O。当日 C/O と当日 C/I の入れ替わりは重複ではない。
 */
export function findRoomConflicts(reservations: Reservation[], targetDate: string): RoomConflict[] {
  const byRoom = new Map<string, string[]>()
  for (const r of reservations) {
    if (r.cancel === 1 || r.room === null) continue
    if (!(r.check_in_date <= targetDate && targetDate < r.check_out_date)) continue
    byRoom.set(r.room, [...(byRoom.get(r.room) ?? []), r.id])
  }
  return ROOM_NUMBERS.flatMap((room) => {
    const ids = byRoom.get(room) ?? []
    return ids.length >= 2 ? [{ room, reservationIds: ids }] : []
  })
}
