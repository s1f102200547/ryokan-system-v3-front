import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { validateReservationPatch } from '@/domain/reservation/validateReservationPatch'
import type { Result } from '@/types/result'
import type { ReservationPatch, UpdateReservationFailure } from '@/types/guestInfo'

export async function updateReservationCommand(
  id: string,
  patch: ReservationPatch,
): Promise<Result<void, UpdateReservationFailure>> {
  return firestoreReservationRepository.updateReservation(id, patch, (current) =>
    validateReservationPatch(current, patch),
  )
}
