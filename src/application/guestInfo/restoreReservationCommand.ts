import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { toMonthDay } from '@/lib/dateUtils'
import type { MailMemoEntry } from '@/types/guestInfo'

type RestoreInput = {
  id: string           // Firestore のドキュメント ID（reservation_number とは限らない。手動追加は自動 ID）
  staffName: string    // 操作したスタッフ名（mailMemo.name に使用）
  targetDate: string   // YYYY-MM-DD
  reason: string
}

export async function restoreReservationCommand(input: RestoreInput): Promise<void> {
  const { id, staffName, targetDate, reason } = input
  const mailMemoEntry: MailMemoEntry = {
    ...toMonthDay(targetDate),
    name: staffName,
    summary: '手動キャンセル復活',
    text: reason,
    source: 'システム',
  }

  await firestoreReservationRepository.restoreReservation(id, mailMemoEntry)
  notifySlackFireAndForget(`[予約復活] ${id} - 理由: ${reason}`)
}
