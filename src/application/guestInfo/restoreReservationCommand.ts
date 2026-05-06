import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import type { MailMemoEntry } from '@/types/guestInfo'

type RestoreInput = {
  id: string           // Firestore doc ID = reservation_number
  staffName: string    // 操作したスタッフ名（mailMemo.name に使用）
  targetDate: string   // YYYY-MM-DD
  reason: string
}

export async function restoreReservationCommand(input: RestoreInput): Promise<void> {
  const { id, staffName, targetDate, reason } = input
  const [, mm, dd] = targetDate.split('-')

  const mailMemoEntry: MailMemoEntry = {
    month: String(parseInt(mm, 10)),
    day: String(parseInt(dd, 10)),
    name: staffName,
    summary: 'キャンセル復活',
    text: reason,
    source: 'システム',
  }

  await firestoreReservationRepository.restoreReservation(id, mailMemoEntry)
  notifySlackFireAndForget(`[予約復活] ${id} - 理由: ${reason}`)
}
