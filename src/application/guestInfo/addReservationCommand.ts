import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { MailMemoEntry, NewReservationInput } from '@/types/guestInfo'

export async function addReservationCommand(input: NewReservationInput): Promise<string> {
  const now = new Date()
  const initialMailMemo: MailMemoEntry = {
    month: String(now.getMonth() + 1),
    day: String(now.getDate()),
    name: input.staff_name,
    summary: '手動で新規追加',
    text: input.add_reason,
    source: 'システム',
  }

  const reservationNumber = await firestoreReservationRepository.addReservation(input, initialMailMemo)

  notifySlackFireAndForget(`[手動追加] ${reservationNumber} - 担当: ${input.staff_name} 理由: ${input.add_reason}`)

  return reservationNumber
}
