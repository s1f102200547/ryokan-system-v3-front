import { ZodError, z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'
import { ROOM_NUMBERS } from '@/types/room'
import type { ReservationRepository } from '@/domain/ports/reservationRepository'
import type { Reservation } from '@/types/reservation'

// Firestoreドキュメントのバリデーションスキーマ（YYYY/MM/DD形式）
const FirestoreReservationSchema = z.object({
  check_in_date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/),
  adult_count: z.number().int().min(1).max(9),
  child_count: z.number().int().min(0).max(9),
  // "" は未割り当てとして null に変換し、7部屋番号 or null のみ許可
  room: z
    .preprocess((v) => (v === '' ? null : v), z.enum(ROOM_NUMBERS).nullable())
    .default(null),
  cancel: z.number().int().nullish().transform((v) => v ?? 0),
  late_out: z.number().int().nullish().transform((v) => v ?? 0),
})

export const firestoreReservationRepository: ReservationRepository = {
  async fetchByDateRange(from, to) {
    try {
      const snapshot = await adminDb
        .collection('guestInfoV2')
        .where('check_in_date', '>=', toFirestoreDate(from))
        .where('check_in_date', '<=', toFirestoreDate(to))
        .get()

      return snapshot.docs.map((doc) => toReservation(doc.id, doc.data()))
    } catch (e) {
      if (e instanceof InfraError) throw e // throw e -> さらに上位のcatchに伝搬する

      // UNAVAILABLE = 14, PERMISSION_DENIED = 7
      const code = (e as { code?: number }).code
      if (code === 14) throw new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable', e) // constructorの引数(code, Error.message, couse)の順で指定
      if (code === 7) throw new InfraError('FIRESTORE_PERMISSION', 'Firestore permission denied', e)

      throw new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unknown error', e)
    }
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
  try {
    const parsed = FirestoreReservationSchema.parse(data)
    return {
      id,
      check_in_date: toIsoDate(parsed.check_in_date),
      check_out_date: toIsoDate(parsed.check_out_date),
      adult_count: parsed.adult_count,
      child_count: parsed.child_count,
      room: parsed.room,
      cancel: parsed.cancel,
      late_out: parsed.late_out,
    }
  } catch (e) {
    if (e instanceof ZodError) {
      throw new InfraError('FIRESTORE_VALIDATION', `Schema validation failed for doc ${id}`, e)
    }
    throw e
  }
}
