import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { addDays } from '@/lib/dateUtils'
import { computeRoomCheckInState } from '@/domain/room/roomState'
import type { RoomCheckInState } from '@/domain/room/roomState'
import { ROOM_NUMBERS } from '@/types/room'
import type { Reservation } from '@/types/reservation'
import {
  ROOM_MAP,
  VALID_ARRIVAL_TIMES,
  OPEN_AIR_TIMES_EVENING,
  OPEN_AIR_TIMES_MORNING,
} from '@/constants/timetable'
import type { ValidArrivalTime } from '@/constants/timetable'
import type { TimetableData } from '@/types/timetable'

const QUERY_RANGE_DAYS = 30

// 部屋番号と当日滞在予約のペア
type RoomStay = { room: string; reservation: Reservation }

export async function getTimetableUseCase(targetDate: string): Promise<TimetableData> {
  const from = addDays(targetDate, -QUERY_RANGE_DAYS)
  const to = addDays(targetDate, QUERY_RANGE_DAYS)
  const reservations = await firestoreReservationRepository.fetchByDateRange(from, to)

  const nextDay = addDays(targetDate, 1)

  // Domain: 各部屋の状態を計算（targetDate / nextDay の2種）
  const stateMap = new Map(
    ROOM_NUMBERS.map((room) => [room, computeRoomCheckInState(reservations, targetDate, room)]),
  )
  const nextDayStateMap = new Map(
    ROOM_NUMBERS.map((room) => [room, computeRoomCheckInState(reservations, nextDay, room)]),
  )

  // 当日滞在ゲスト: stayingReservation（連泊中）または todayCheckInReservation（当日CI）
  // ROOM_NUMBERS 順を保持
  const stayingTonight: RoomStay[] = ROOM_NUMBERS.flatMap((room) => {
    const state = stateMap.get(room)!
    const r = state.stayingReservation ?? state.todayCheckInReservation
    return r !== null ? [{ room, reservation: r }] : []
  })

  return {
    checkInSlots: buildCheckInSlots(stateMap),
    stayingGuestLabels: buildStayingGuestLabels(stayingTonight, targetDate),
    eveningBathSlots: buildBathSlots(stayingTonight, targetDate, OPEN_AIR_TIMES_EVENING),
    dinnerSlots: buildDinnerSlots(stayingTonight, targetDate),
    guestInfoRows: buildGuestInfoRows(stateMap, stayingTonight, targetDate),
    breakfastSlots: buildBreakfastSlots(stayingTonight, targetDate),
    checkoutRooms: buildCheckoutRooms(nextDayStateMap),
    morningBathSlots: buildBathSlots(stayingTonight, targetDate, OPEN_AIR_TIMES_MORNING),
    lateCheckoutRooms: buildLateCheckoutRooms(nextDayStateMap),
  }
}

// ---------------------------------------------------------------------------
// ラベル生成ヘルパー
// ---------------------------------------------------------------------------

function roomMark(room: string): string {
  return ROOM_MAP[room] ?? room
}

/** 宿泊インデックス: チェックイン当日=0、翌日=1、… */
function nightIdx(checkInDate: string, targetDate: string): number {
  const [cy, cm, cd] = checkInDate.split('-').map(Number)
  const [ty, tm, td] = targetDate.split('-').map(Number)
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(cy, cm - 1, cd)) / 86400000
}

/** {部屋マーク}{宿泊者名}-{大人数}[({子供数})] */
function guestLabel(room: string, r: Reservation): string {
  const children = r.child_count > 0 ? `(${r.child_count})` : ''
  return `${roomMark(room)}${r.guest_name}-${r.adult_count}${children}`
}

/** {部屋マーク}-{大人数}[({子供数})]({現在泊目}/{全泊数}泊目) */
function stayingLabel(room: string, r: Reservation, targetDate: string): string {
  const children = r.child_count > 0 ? `(${r.child_count})` : ''
  const [cy, cm, cd] = r.check_in_date.split('-').map(Number)
  const [oy, om, od] = r.check_out_date.split('-').map(Number)
  const total = (Date.UTC(oy, om - 1, od) - Date.UTC(cy, cm - 1, cd)) / 86400000
  const current = nightIdx(r.check_in_date, targetDate) + 1
  return `${roomMark(room)}-${r.adult_count}${children}(${current}/${total}泊目)`
}

// ---------------------------------------------------------------------------
// セクション別ビルダー
// ---------------------------------------------------------------------------

/** checkInSlots: domain の todayCheckInReservation を使用 */
function buildCheckInSlots(stateMap: Map<string, RoomCheckInState>): Record<string, string[]> {
  const slots: Record<string, string[]> = {}
  for (const room of ROOM_NUMBERS) {
    const r = stateMap.get(room)!.todayCheckInReservation
    if (r === null) continue
    const isValid =
      r.arrival_time !== null &&
      (VALID_ARRIVAL_TIMES as readonly string[]).includes(r.arrival_time)
    const key = isValid ? (r.arrival_time as ValidArrivalTime) : 'OTHER'
    const label =
      !isValid && r.arrival_time !== null
        ? `${guestLabel(room, r)}（${r.arrival_time}着）`
        : guestLabel(room, r)
    ;(slots[key] ??= []).push(label)
  }
  return slots
}

/** stayingGuestLabels: 2泊以上の全滞在ゲストを横並び表示 */
function buildStayingGuestLabels(staying: RoomStay[], targetDate: string): string[] {
  return staying
    .filter(({ reservation: r }) => {
      const [cy, cm, cd] = r.check_in_date.split('-').map(Number)
      const [oy, om, od] = r.check_out_date.split('-').map(Number)
      const total = (Date.UTC(oy, om - 1, od) - Date.UTC(cy, cm - 1, cd)) / 86400000
      return total >= 2
    })
    .map(({ room, reservation: r }) => stayingLabel(room, r, targetDate))
}

/** eveningBathSlots / morningBathSlots: 共通ロジック */
function buildBathSlots(
  staying: RoomStay[],
  targetDate: string,
  validTimes: readonly string[],
): Record<string, string[]> {
  const slots: Record<string, string[]> = {}
  for (const { room, reservation: r } of staying) {
    const idx = nightIdx(r.check_in_date, targetDate)
    const time = r.open_air_bath_time[idx] ?? null
    if (time !== null && validTimes.includes(time)) {
      ;(slots[time] ??= []).push(roomMark(room))
    }
  }
  return slots
}

/** dinnerSlots: NONE/CANCEL は除外、PENDING → '未定' キー */
function buildDinnerSlots(staying: RoomStay[], targetDate: string): Record<string, string[]> {
  const slots: Record<string, string[]> = {}
  for (const { room, reservation: r } of staying) {
    const idx = nightIdx(r.check_in_date, targetDate)
    const value = r.dinner_time[idx]
    if (value === undefined || value === 'NONE' || value === 'CANCEL') continue
    const key = value === 'PENDING' ? '未定' : value
    ;(slots[key] ??= []).push(guestLabel(room, r))
  }
  return slots
}

/** guestInfoRows: domain の isTodayVacant で空室判定 */
function buildGuestInfoRows(
  stateMap: Map<string, RoomCheckInState>,
  staying: RoomStay[],
  targetDate: string,
): Record<string, string> {
  const stayingByRoom = new Map(staying.map(({ room, reservation }) => [room, reservation]))
  return Object.fromEntries(
    ROOM_NUMBERS.map((room) => {
      if (stateMap.get(room)!.isTodayVacant) return [room, '空室']
      const r = stayingByRoom.get(room)
      if (r === undefined) return [room, '空室']
      const idx = nightIdx(r.check_in_date, targetDate)
      return [room, r.timetable_info[idx] ?? '']
    }),
  )
}

/** breakfastSlots */
function buildBreakfastSlots(staying: RoomStay[], targetDate: string): Record<string, string[]> {
  const slots: Record<string, string[]> = {}
  for (const { room, reservation: r } of staying) {
    const idx = nightIdx(r.check_in_date, targetDate)
    const key = r.breakfast_time[idx] ?? null
    if (key !== null) {
      ;(slots[key] ??= []).push(roomMark(room))
    }
  }
  return slots
}

/** checkoutRooms: nextDay の isTodayCheckout を使用 */
function buildCheckoutRooms(nextDayStateMap: Map<string, RoomCheckInState>): string[] {
  return ROOM_NUMBERS.filter((room) => nextDayStateMap.get(room)!.isTodayCheckout).map(roomMark)
}

/** lateCheckoutRooms: nextDay の isLateCheckout を使用 */
function buildLateCheckoutRooms(nextDayStateMap: Map<string, RoomCheckInState>): string[] {
  return ROOM_NUMBERS.filter((room) => nextDayStateMap.get(room)!.isLateCheckout).map(roomMark)
}
