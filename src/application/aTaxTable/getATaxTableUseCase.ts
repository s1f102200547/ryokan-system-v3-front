import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'
import { isATaxExempt, calcATax } from '@/domain/reservation/bookingSitePolicy'
import { dateDiff } from '@/lib/dateUtils'
import { A_TAX_RATE_PER_PERSON_PER_NIGHT } from '@/constants/guestInfo'
import type { Reservation } from '@/types/reservation'

export type ATaxTableRow = Reservation & {
  nights: number
  tax: number // その場計算（Firestoreに保存しない）
}

export type ATaxTableData = {
  rows: ATaxTableRow[]
  safeBalanceCheckers: Record<string, string> // check_in_date -> staffName
}

export async function getATaxTableUseCase(year: number, month: number): Promise<ATaxTableData> {
  const reservations = await firestoreReservationRepository.fetchByMonth(year, month)

  const rows: ATaxTableRow[] = reservations.map((r) => {
    const nights = dateDiff(r.check_in_date, r.check_out_date)
    const tax = isATaxExempt(r.booking_site)
      ? 0
      : calcATax(r.adult_count, nights, A_TAX_RATE_PER_PERSON_PER_NIGHT)
    return { ...r, nights, tax }
  })

  const uniqueDates = [...new Set(rows.map((r) => r.check_in_date))]
  const safeBalanceCheckers = await firestoreDailyRepository.fetchSafeBalanceCheckers(uniqueDates)

  return { rows, safeBalanceCheckers }
}
