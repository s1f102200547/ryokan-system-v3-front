import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { NewReservationInput } from '@/types/guestInfo'

type AddInput = NewReservationInput & {
  add_reason: string // Slack通知にのみ使用
}

export async function addReservationCommand(input: AddInput): Promise<string> {
  const reservationNumber = await firestoreReservationRepository.addReservation(input)

  notifySlackFireAndForget(`[手動追加] ${reservationNumber} - 理由: ${input.add_reason}`)

  return reservationNumber
}
