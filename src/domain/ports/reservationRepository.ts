import type { Reservation } from '@/types/reservation'

export interface ReservationRepository {
  // from, to: YYYY-MM-DD
  fetchByDateRange(from: string, to: string): Promise<Reservation[]>
}
