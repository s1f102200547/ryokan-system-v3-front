import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { addDays } from '@/lib/dateUtils'
import { computeRoomCheckInState } from '@/domain/room/roomState'
import type { RoomCheckInState } from '@/domain/room/roomState'
import { ROOM_NUMBERS } from '@/types/room'
import type { CleaningBoardData } from '@/types/cleaningBoard'

const QUERY_RANGE_DAYS = 30

/*
UseCase <- ここ
  ↓
Repository（DB取得）
  ↓
Domain（状態計算）
  ↓
DTO（UI用データ）
*/
export async function getCleaningBoardUseCase(
  targetDate: string, // YYYY-MM-DD
): Promise<CleaningBoardData> {
  const from = addDays(targetDate, -QUERY_RANGE_DAYS)
  const to = addDays(targetDate, QUERY_RANGE_DAYS)

  const reservations = await firestoreReservationRepository.fetchByDateRange(from, to) // infraでdbデータ取得

  const rows = ROOM_NUMBERS.map((room) => {
    const state = computeRoomCheckInState(reservations, targetDate, room) // domainで計算
    return {
      room,
      isTodayCheckIn: state.isTodayCheckIn,
      isFutureCheckIn: state.isFutureCheckIn,
      checkInReservation: state.checkInReservation,
      stayingReservation: state.stayingReservation
        ? { adult_count: state.stayingReservation.adult_count, child_count: state.stayingReservation.child_count }
        : null,
      isStayingContinued: state.isStayingContinued,
      isConsecutive: state.isConsecutive,
      autoNotes: computeAutoNotes(room, state),
    }
  })

  // 部屋未割り当て（room=null）かつ今後のCI予約を警告用に収集
  const unassignedReservations = reservations
    .filter((r) => r.cancel !== 1 && r.room === null && r.check_in_date >= targetDate)
    .map((r) => ({ id: r.id, check_in_date: r.check_in_date }))

  return { rows, unassignedReservations }
}

function computeAutoNotes(room: string, state: RoomCheckInState): string[] {
  const notes: string[] = []
  if (state.isLateCheckout) notes.push(`${room}: レイトアウト11:00`)
  if (state.isPreviousDayVacant) notes.push(`${room}: 前日空室のためセットアップ済み`)
  if (state.isTodayVacant) notes.push(`${room}: 本日空室のため翌日以降の予約情報をもとにセットアップ`)
  return notes
}

