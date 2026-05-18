import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'
import { addDays, dateDiff } from '@/lib/dateUtils'
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
import type { TimetableData, TimetableGuestInfoRow } from '@/types/timetable'

const QUERY_RANGE_DAYS = 30

// 部屋番号と当日滞在予約のペア
type RoomStay = { room: string; reservation: Reservation }

export async function getTimetableUseCase(targetDate: string): Promise<TimetableData> {
  const from = addDays(targetDate, -QUERY_RANGE_DAYS)
  const to = addDays(targetDate, QUERY_RANGE_DAYS)
  const [reservations, todos] = await Promise.all([
    firestoreReservationRepository.fetchByDateRange(from, to),
    firestoreDailyRepository.fetchDailyTodos(targetDate),
  ])

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
    todos,
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
  return dateDiff(checkInDate, targetDate)
}

/** {部屋マーク}-{大人数}[({子供数})]({現在泊目}/{全泊数}泊目) */
function stayingLabel(room: string, r: Reservation, targetDate: string): string {
  const children = r.child_count > 0 ? `(${r.child_count})` : ''
  const total = dateDiff(r.check_in_date, r.check_out_date)
  const current = nightIdx(r.check_in_date, targetDate) + 1
  return `${roomMark(room)}-${r.adult_count}${children}(${current}/${total}泊目)`
}

function guestCountLabel(r: Reservation): string {
  const total = r.adult_count + r.child_count
  return r.child_count > 0 ? `${total}人 うち${r.child_count}名は子供` : `${total}人`
}

function parseClockMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (match === null) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function checkInSlotKey(arrivalTime: string | null): ValidArrivalTime {
  if (arrivalTime === null) return '未定'
  const minutes = parseClockMinutes(arrivalTime)
  if (minutes === null) return '未定'
  if (minutes < 14 * 60) return '13:00以前'
  if (minutes >= 19 * 60) return '19:00以降'
  if ((VALID_ARRIVAL_TIMES as readonly string[]).includes(arrivalTime)) {
    return arrivalTime as ValidArrivalTime
  }
  return '未定'
}

function checkInSlotLabel(room: string, arrivalTime: string | null): string {
  const key = checkInSlotKey(arrivalTime)
  if ((key === '13:00以前' || key === '19:00以降') && arrivalTime !== null) {
    return `${room}(${arrivalTime}時)`
  }
  return room
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
    const key = checkInSlotKey(r.arrival_time)
    ;(slots[key] ??= []).push(checkInSlotLabel(room, r.arrival_time))
  }
  return slots
}

/** stayingGuestLabels: 2泊以上の全滞在ゲストを横並び表示 */
function buildStayingGuestLabels(staying: RoomStay[], targetDate: string): string[] {
  return staying
    .filter(({ reservation: r }) => dateDiff(r.check_in_date, r.check_out_date) >= 2)
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
    ;(slots[key] ??= []).push(room)
  }
  return slots
}

/** guestInfoRows: domain の isTodayVacant で空室判定 */
function buildGuestInfoRows(
  stateMap: Map<string, RoomCheckInState>,
  staying: RoomStay[],
  targetDate: string,
): Record<string, TimetableGuestInfoRow> {
  const stayingByRoom = new Map(staying.map(({ room, reservation }) => [room, reservation]))
  return Object.fromEntries(
    ROOM_NUMBERS.map((room) => {
      if (stateMap.get(room)!.isTodayVacant) {
        return [room, { room, guestName: '', guestCountLabel: '', stayProgressLabel: '', memo: '空室' }]
      }
      const r = stayingByRoom.get(room)
      if (r === undefined) {
        return [room, { room, guestName: '', guestCountLabel: '', stayProgressLabel: '', memo: '空室' }]
      }
      const idx = nightIdx(r.check_in_date, targetDate)
      const total = dateDiff(r.check_in_date, r.check_out_date)
      return [
        room,
        {
          room,
          guestName: r.guest_name,
          guestCountLabel: guestCountLabel(r),
          stayProgressLabel: `${idx + 1}/${total}泊目`,
          memo: r.timetable_info[idx] ?? '',
        },
      ]
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
