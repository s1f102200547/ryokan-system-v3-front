import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { MailMemoEntry } from '@/types/guestInfo'

type CancelInput = {
  id: string           // Firestore doc ID = reservation_number
  guestName: string
  targetDate: string   // YYYY-MM-DD（メールログの month/day に使用）
  reason: string
}

export async function cancelReservationCommand(input: CancelInput): Promise<void> {
  const { id, guestName, targetDate, reason } = input
  const [, mm, dd] = targetDate.split('-')

  const mailMemoEntry: MailMemoEntry = {
    month: String(parseInt(mm, 10)),
    day: String(parseInt(dd, 10)),
    name: guestName,
    summary: 'キャンセル',
    text: reason,
    source: 'システム',
  }

  await firestoreReservationRepository.cancelReservation(id, mailMemoEntry)
  notifySlackFireAndForget(`[キャンセル] ${id} - 理由: ${reason}`)
}
