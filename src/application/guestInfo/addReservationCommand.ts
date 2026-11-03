import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { notifySlackFireAndForget } from '@/lib/slack'
import { getTodayJST, toMonthDay } from '@/lib/dateUtils'
import type { MailMemoEntry, NewReservationInput } from '@/types/guestInfo'

export async function addReservationCommand(input: NewReservationInput): Promise<string> {
  // 月日は JST の今日。サーバーのローカル時刻（Cloud Run は UTC）だと JST 0:00〜9:00 が前日になる
  const initialMailMemo: MailMemoEntry = {
    ...toMonthDay(getTodayJST()),
    name: input.staff_name,
    summary: '手動で新規追加',
    text: input.add_reason,
    source: 'システム',
  }

  const reservationNumber = await firestoreReservationRepository.addReservation(input, initialMailMemo)

  notifySlackFireAndForget(`[手動追加] ${reservationNumber} - 担当: ${input.staff_name} 理由: ${input.add_reason}`)

  return reservationNumber
}
