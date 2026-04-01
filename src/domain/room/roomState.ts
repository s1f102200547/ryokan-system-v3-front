import type { Reservation } from '@/types/reservation'

export type RoomCheckInState = {
  stayingReservation: Reservation | null
  isStayingContinued: boolean
  checkInReservation: Pick<Reservation, 'adult_count' | 'child_count'> | null
  isTodayCheckIn: boolean
  isFutureCheckIn: boolean
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

  const checkInReservation = isStayingContinued
    ? null
    : (active
        .filter((r) => r.check_in_date >= targetDate)
        .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0] ?? null)

  const isTodayCheckIn = checkInReservation?.check_in_date === targetDate
  const isFutureCheckIn =
    checkInReservation !== null && checkInReservation.check_in_date > targetDate

  return { stayingReservation, isStayingContinued, checkInReservation, isTodayCheckIn, isFutureCheckIn }
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
