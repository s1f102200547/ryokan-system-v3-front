import { adminDb } from '@/lib/firebase/admin'
import type { ReservationRepository } from '@/domain/ports/reservationRepository'
import type { Reservation } from '@/types/reservation'

export const firestoreReservationRepository: ReservationRepository = {
  async fetchByDateRange(from, to) {
    const snapshot = await adminDb
      .collection('reservations')
      .where('check_in_date', '>=', toFirestoreDate(from))
      .where('check_in_date', '<=', toFirestoreDate(to))
      .get()

    return snapshot.docs.map((doc) => toReservation(doc.id, doc.data()))
  },
}

// YYYY-MM-DD → YYYY/MM/DD（Firestoreのフォーマットに合わせる）
function toFirestoreDate(date: string): string {
  return date.replace(/-/g, '/')
}

// YYYY/MM/DD → YYYY-MM-DD（domain層のフォーマットに統一）
function toIsoDate(date: string): string {
  return date.replace(/\//g, '-')
}

function toReservation(id: string, data: FirebaseFirestore.DocumentData): Reservation {
  return {
    id,
    check_in_date: toIsoDate(data.check_in_date),
    check_out_date: toIsoDate(data.check_out_date),
    adult_count: data.adult_count,
    child_count: data.child_count,
    room: data.room ?? null,
    cancel: data.cancel ?? 0,
    late_out: data.late_out,
  }
}
