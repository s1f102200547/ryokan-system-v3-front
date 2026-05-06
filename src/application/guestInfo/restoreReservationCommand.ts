import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { MailMemoEntry } from '@/types/guestInfo'

type RestoreInput = {
  id: string           // Firestore doc ID = reservation_number
  guestName: string
  targetDate: string   // YYYY-MM-DD
  reason: string
}

export async function restoreReservationCommand(input: RestoreInput): Promise<void> {
  const { id, guestName, targetDate, reason } = input
  const [, mm, dd] = targetDate.split('-')

  const mailMemoEntry: MailMemoEntry = {
    month: String(parseInt(mm, 10)),
    day: String(parseInt(dd, 10)),
    name: guestName,
    summary: 'キャンセル復活',
    text: reason,
    source: 'システム',
  }

  await firestoreReservationRepository.restoreReservation(id, mailMemoEntry)
  notifySlackFireAndForget(`[予約復活] ${id} - 理由: ${reason}`)
}
