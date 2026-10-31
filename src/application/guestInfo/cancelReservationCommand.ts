import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { toMonthDay } from '@/lib/dateUtils'
import type { Result } from '@/types/result'
import type { CancelStateFailure, MailMemoEntry } from '@/types/guestInfo'

type CancelInput = {
  id: string           // Firestore のドキュメント ID（reservation_number とは限らない。手動追加は自動 ID）
  staffName: string    // 操作したスタッフ名（mailMemo.name に使用）
  targetDate: string   // YYYY-MM-DD（メールログの month/day に使用）
  reason: string
}

export async function cancelReservationCommand(input: CancelInput): Promise<Result<void, CancelStateFailure>> {
  const { id, staffName, targetDate, reason } = input
  const mailMemoEntry: MailMemoEntry = {
    ...toMonthDay(targetDate),
    name: staffName,
    summary: '手動キャンセル',
    text: reason,
    source: 'システム',
  }

  const result = await firestoreReservationRepository.cancelReservation(id, mailMemoEntry)
  // すでにその状態なら何も変えていないので通知しない（BugHunting.md #27）
  if (result.success) notifySlackFireAndForget(`[キャンセル] ${id} - 理由: ${reason}`)
  return result
}
