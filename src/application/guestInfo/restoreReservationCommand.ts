import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { toMonthDay } from '@/lib/dateUtils'
import type { Result } from '@/types/result'
import type { CancelStateFailure, MailMemoEntry } from '@/types/guestInfo'

type RestoreInput = {
  id: string           // Firestore のドキュメント ID（reservation_number とは限らない。手動追加は自動 ID）
  staffName: string    // 操作したスタッフ名（mailMemo.name に使用）
  targetDate: string   // YYYY-MM-DD
  reason: string
}

export async function restoreReservationCommand(input: RestoreInput): Promise<Result<void, CancelStateFailure>> {
  const { id, staffName, targetDate, reason } = input
  const mailMemoEntry: MailMemoEntry = {
    ...toMonthDay(targetDate),
    name: staffName,
    summary: '手動キャンセル復活',
    text: reason,
    source: 'システム',
  }

  const result = await firestoreReservationRepository.restoreReservation(id, mailMemoEntry)
  // すでにその状態なら何も変えていないので通知しない
  if (result.success) notifySlackFireAndForget(`[予約復活] ${id} - 理由: ${reason}`)
  return result
}
