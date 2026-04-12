import type { Reservation } from '@/types/reservation'
import { addDays } from '@/lib/dateUtils'

export type RoomCheckInState = {
  stayingReservation: Reservation | null // 対象日に滞在中の予約（チェックイン日 < 対象日 < チェックアウト日）
  isStayingContinued: boolean // 滞在中の予約が翌日以降も続く（連泊中かつ翌日も泊まる）
  isLateCheckout: boolean // 対象日にレイトチェックアウトの予約がある
  checkInReservation: Pick<Reservation, 'adult_count' | 'child_count'> | null // 対象日以降で最も近いチェックイン予約の人数情報（連泊継続中はnull）
  isTodayCheckIn: boolean // 対象日がチェックイン日の予約がある
  isFutureCheckIn: boolean // チェックイン日が対象日より後の予約がある（今後チェックイン予定）
  isConsecutiveCheckIn: boolean // チェックイン予約の宿泊数が2泊以上（連泊チェックイン）
  isConsecutive: boolean // CleaningBoard専用: 連泊カードを置くか否か
  isTodayVacant: boolean // 対象日が空室（滞在中の予約もチェックインもない）
  isPreviousDayVacant: boolean // 前日が空室（対象日をまたぐ滞在中の予約がない）
}

export function computeRoomCheckInState(
  reservations: Reservation[],
  targetDate: string, // YYYY-MM-DD
  room: string,
): RoomCheckInState {
  const active = reservations.filter((r) => r.cancel !== 1 && r.room === room)

  const stayingReservation =
    active.find((r) => r.check_in_date < targetDate && r.check_out_date > targetDate) ?? null

  const nextDay = addDays(targetDate, 1)
  const isStayingContinued =
    stayingReservation !== null && stayingReservation.check_out_date > nextDay

  const checkInFull = isStayingContinued
    ? null
    : (active
        .filter((r) => r.check_in_date >= targetDate)
        .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0] ?? null)

  const isConsecutiveCheckIn =
    checkInFull !== null &&
    dateDiff(checkInFull.check_in_date, checkInFull.check_out_date) >= 2

  const checkInReservation = checkInFull
    ? { adult_count: checkInFull.adult_count, child_count: checkInFull.child_count }
    : null

  const isTodayCheckIn = checkInFull?.check_in_date === targetDate
  const isFutureCheckIn = checkInFull !== null && checkInFull.check_in_date > targetDate

  const isConsecutive = stayingReservation !== null ? isStayingContinued : isConsecutiveCheckIn

  const isLateCheckout = active.some(
    (r) => r.check_out_date === targetDate && r.late_out === 1,
  )
  const isTodayVacant = stayingReservation === null && !isTodayCheckIn
  const isPreviousDayVacant = !active.some(
    (r) => r.check_in_date < targetDate && r.check_out_date >= targetDate,
  )

  return {
    stayingReservation,
    isStayingContinued,
    isLateCheckout,
    checkInReservation,
    isTodayCheckIn,
    isFutureCheckIn,
    isConsecutiveCheckIn,
    isConsecutive,
    isTodayVacant,
    isPreviousDayVacant,
  }
}

function dateDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const msPerDay = 86400000
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / msPerDay
}

