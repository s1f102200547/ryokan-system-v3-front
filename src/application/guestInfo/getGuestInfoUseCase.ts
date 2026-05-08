import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import type { Reservation } from '@/types/reservation'

export type GuestInfoData = {
  normal: Reservation[]    // cancel !== 1、check_in_date === targetDate
  cancelled: Reservation[] // cancel === 1、check_in_date === targetDate
}

export async function getGuestInfoUseCase(targetDate: string): Promise<GuestInfoData> {
  const reservations = await firestoreReservationRepository.fetchByDateRange(targetDate, targetDate)

  const normal: Reservation[] = []
  const cancelled: Reservation[] = []

  for (const r of reservations) {
    if (r.cancel === 1) {
      cancelled.push(r)
    } else {
      normal.push(r)
    }
  }

  return { normal, cancelled }
}
