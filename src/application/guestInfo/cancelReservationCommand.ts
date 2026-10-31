import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { toMonthDay } from '@/lib/dateUtils'
import type { MailMemoEntry } from '@/types/guestInfo'

type CancelInput = {
  id: string           // Firestore doc ID = reservation_number
  staffName: string    // 操作したスタッフ名（mailMemo.name に使用）
  targetDate: string   // YYYY-MM-DD（メールログの month/day に使用）
  reason: string
}

export async function cancelReservationCommand(input: CancelInput): Promise<void> {
  const { id, staffName, targetDate, reason } = input
  const mailMemoEntry: MailMemoEntry = {
    ...toMonthDay(targetDate),
    name: staffName,
    summary: '手動キャンセル',
    text: reason,
    source: 'システム',
  }

  await firestoreReservationRepository.cancelReservation(id, mailMemoEntry)
  notifySlackFireAndForget(`[キャンセル] ${id} - 理由: ${reason}`)
}
