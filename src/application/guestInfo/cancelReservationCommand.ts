import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { MailMemoEntry } from '@/types/guestInfo'

type CancelInput = {
  id: string
  reservationNumber: string // Slack通知用（空なら "(番号なし)"）
  guestName: string
  targetDate: string // YYYY-MM-DD（メールログの month/day に使用）
  reason: string
}

export async function cancelReservationCommand(input: CancelInput): Promise<void> {
  const { id, reservationNumber, guestName, targetDate, reason } = input
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

  const number = reservationNumber || '(番号なし)'
  notifySlackFireAndForget(`[キャンセル] ${number} - 理由: ${reason}`)
}
