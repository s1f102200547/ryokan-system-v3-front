import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'
import { calcATax } from '@/domain/reservation/bookingSitePolicy'
import { dateDiff } from '@/lib/dateUtils'
import { A_TAX_RATE_PER_PERSON_PER_NIGHT } from '@/constants/guestInfo'
import type { Reservation } from '@/types/reservation'

// 宿泊税の表に出す項目だけ。メールメモ・その他メモ・国などの個人情報は返さない
export type ATaxTableRow = Pick<
  Reservation,
  | 'id' | 'cancel' | 'check_in_date' | 'room' | 'guest_name' | 'adult_count'
  | 'booking_site' | 'a_tax_received' | 'a_tax_received_by_staff_name'
> & {
  nights: number
  tax: number // その場計算（Firestoreに保存しない）
}

export type ATaxTableData = {
  rows: ATaxTableRow[]
  safeBalanceCheckers: Record<string, string> // check_in_date -> staffName
}

export async function getATaxTableUseCase(year: number, month: number): Promise<ATaxTableData> {
  const reservations = await firestoreReservationRepository.fetchByMonth(year, month)
  const activeReservations = reservations.filter((r) => r.cancel !== 1)

  const rows: ATaxTableRow[] = activeReservations.map((r) => {
    const nights = dateDiff(r.check_in_date, r.check_out_date)
    const tax = calcATax(r.adult_count, nights, A_TAX_RATE_PER_PERSON_PER_NIGHT)
    // 予約をそのまま広げず、項目を1つずつ選ぶ（予約に項目が増えても、ここから漏れない）
    return {
      id: r.id,
      cancel: r.cancel,
      check_in_date: r.check_in_date,
      room: r.room,
      guest_name: r.guest_name,
      adult_count: r.adult_count,
      booking_site: r.booking_site,
      a_tax_received: r.a_tax_received,
      a_tax_received_by_staff_name: r.a_tax_received_by_staff_name,
      nights,
      tax,
    }
  })

  // check_in_date（infra で YYYY-MM-DD に変換済み）は、そのまま dailyInfo のドキュメント ID として使える。
  // computeProcessedRows も同じ check_in_date をキーにして締めスタッフ名を引く
  const uniqueDates = [...new Set(rows.map((r) => r.check_in_date))]
  const safeBalanceCheckers = await firestoreDailyRepository.fetchSafeBalanceCheckers(uniqueDates)

  return { rows, safeBalanceCheckers }
}
