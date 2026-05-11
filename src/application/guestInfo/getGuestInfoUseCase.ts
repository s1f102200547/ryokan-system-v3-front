import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { addDays } from '@/lib/dateUtils'
import type { Reservation } from '@/types/reservation'

export type GuestInfoData = {
  normal: Reservation[]    // cancel !== 1、check_in_date === targetDate
  staying: Reservation[]   // cancel !== 1、check_in_date < targetDate < check_out_date
  cancelled: Reservation[] // cancel === 1、check_in_date === targetDate
}

export async function getGuestInfoUseCase(targetDate: string): Promise<GuestInfoData> {
  const from = addDays(targetDate, -30)
  const reservations = await firestoreReservationRepository.fetchByDateRange(from, targetDate)

  const normal: Reservation[] = []
  const staying: Reservation[] = []
  const cancelled: Reservation[] = []

  for (const r of reservations) {
    if (r.check_in_date === targetDate) {
      if (r.cancel === 1) cancelled.push(r)
      else normal.push(r)
    } else if (r.check_in_date < targetDate && r.check_out_date > targetDate && r.cancel !== 1) {
      staying.push(r)
    }
  }

  return { normal, staying, cancelled }
}
