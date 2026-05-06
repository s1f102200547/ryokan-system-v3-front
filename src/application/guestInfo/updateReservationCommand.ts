import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import type { ReservationPatch } from '@/types/guestInfo'

export async function updateReservationCommand(id: string, patch: ReservationPatch): Promise<void> {
  await firestoreReservationRepository.updateReservation(id, patch)
}
