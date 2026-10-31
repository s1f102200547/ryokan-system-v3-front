import type { Reservation } from '@/types/reservation'
import type { Result } from '@/types/result'
import type {
  ATaxPatch, MailMemoEntry, NewReservationInput, ReservationPatch, ReservationPatchViolation, StayFacts,
  UpdateReservationFailure,
} from '@/types/guestInfo'

export interface ReservationRepository {
  // from, to: YYYY-MM-DD
  fetchByDateRange(from: string, to: string): Promise<Reservation[]>
  fetchByMonth(year: number, month: number): Promise<Reservation[]>
  cancelReservation(id: string, mailMemoEntry: MailMemoEntry): Promise<void>
  restoreReservation(id: string, mailMemoEntry: MailMemoEntry): Promise<void>
  // returns reservation_number（UUID v7）
  addReservation(input: NewReservationInput, initialMailMemo: MailMemoEntry): Promise<string>
  // DB の今の値を validate に渡し、通ったときだけ書き込む（読み取りから書き込みまでを1つのトランザクションで行う）
  updateReservation(
    id: string,
    patch: ReservationPatch,
    validate: (current: StayFacts) => Result<void, ReservationPatchViolation[]>,
  ): Promise<Result<void, UpdateReservationFailure>>
  // a_tax_table の 3フィールド独立更新
  updateATax(id: string, patch: ATaxPatch): Promise<void>
}
