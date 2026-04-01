import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { computeRoomCheckInState } from '@/domain/room/roomState'
import type { CleaningBoardRow } from '@/types/cleaningBoard'

const ROOM_NUMBERS = ['21', '22', '31', '32', '42', '43', '61'] as const
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
): Promise<CleaningBoardRow[]> {
  const from = addDays(targetDate, -QUERY_RANGE_DAYS)
  const to = addDays(targetDate, QUERY_RANGE_DAYS)

  const reservations = await firestoreReservationRepository.fetchByDateRange(from, to) //infraでdbデータ取得

  return ROOM_NUMBERS.map((room) => {
    const state = computeRoomCheckInState(reservations, targetDate, room) //dmainで計算
    return {
      room,
      isTodayCheckIn: state.isTodayCheckIn,
      isFutureCheckIn: state.isFutureCheckIn,
      checkInReservation: state.checkInReservation,
    }
  })
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
