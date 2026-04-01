import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { computeRoomCheckInState } from '@/domain/room/roomState'
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
    }
  })

  // 部屋未割り当て（room=null）かつ今後のCI予約を警告用に収集
  const unassignedReservations = reservations
    .filter((r) => r.cancel !== 1 && r.room === null && r.check_in_date >= targetDate)
    .map((r) => ({ id: r.id, check_in_date: r.check_in_date }))

  return { rows, unassignedReservations }
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day + days)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}
