import type { Reservation } from '@/types/reservation'
import type { MailMemoEntry, NewReservationInput, ReservationPatch } from '@/types/guestInfo'

export interface ReservationRepository {
  // from, to: YYYY-MM-DD
  fetchByDateRange(from: string, to: string): Promise<Reservation[]>
  fetchByMonth(year: number, month: number): Promise<Reservation[]>
  cancelReservation(id: string, mailMemoEntry: MailMemoEntry): Promise<void>
  restoreReservation(id: string, mailMemoEntry: MailMemoEntry): Promise<void>
  // returns reservation_number（UUID v7）
  addReservation(input: NewReservationInput): Promise<string>
  updateReservation(id: string, patch: ReservationPatch): Promise<void>
  updateATaxReceived(id: string, received: boolean, staffName: string): Promise<void>
}
