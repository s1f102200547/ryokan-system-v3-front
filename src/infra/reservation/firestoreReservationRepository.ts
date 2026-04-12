import { ZodError, z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'
import { ROOM_NUMBERS } from '@/types/room'
import type { ReservationRepository } from '@/domain/ports/reservationRepository'
import type { Reservation } from '@/types/reservation'

// --- バリデーション用定数（Firestore 値の許容範囲） ---

const ARRIVAL_TIME_VALUES = [
  '6:00', '7:00', '8:00', '9:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
] as const

const DINNER_TIME_VALUES = [
  'NONE', 'CANCEL', 'PENDING',
  '17:30', '18:00', '18:30', '19:00', '19:30', '20:00',
] as const

const BREAKFAST_TIME_VALUES = [
  '7:30a', '8:00a', '9:00a', '8:30a', '9:30a',
  '7:30b', '8:00b', '9:00b', '8:30b', '9:30b',
] as const

const OPEN_AIR_BATH_TIME_VALUES = [
  // 夕方
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
  // 朝
  '7:30', '8:00', '8:30', '9:00', '9:30',
] as const

// --- Firestoreドキュメントのバリデーションスキーマ ---
// 基本フィールド: ZodError になりうる（= FIRESTORE_DATA_CORRUPTION の対象）
// 配列フィールド: 後述の normalizeArray で明示的に補完・変換する

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
  // 欠損 or 不正 → ""
  guest_name: z.string().max(100).catch(''),
  // 定義外 or 欠損 → null
  arrival_time: z.enum(ARRIVAL_TIME_VALUES).nullable().catch(null),
  // 配列フィールドは unknown で受け取り、normalizeArray で処理
  dinner_time: z.unknown(),
  breakfast_time: z.unknown(),
  open_air_bath_time: z.unknown(),
  timetable_info: z.unknown(),
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
      if (e instanceof InfraError) throw e

      const code = (e as { code?: number }).code
      if (code === 14) throw new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable', e)
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

// YYYY-MM-DD 2日間の泊数を計算
function calcNights(checkIn: string, checkOut: string): number {
  const msPerDay = 86_400_000
  const [iy, im, id] = checkIn.split('-').map(Number)
  const [oy, om, od] = checkOut.split('-').map(Number)
  return (Date.UTC(oy, om - 1, od) - Date.UTC(iy, im - 1, id)) / msPerDay
}

/**
 * 配列フィールドの正規化
 *
 * 1. 配列かどうかチェック
 * 2. 長さが nights と一致するかチェック
 * → 1 or 2 が false → nights 分の fallback 配列を返す
 * → 両方 true → 各要素を isValid でチェックし、不正なら fallback に差し替え
 */
function normalizeArray<T>(
  raw: unknown,
  nights: number,
  isValid: (v: unknown) => v is T,
  fallback: T,
): T[] {
  if (!Array.isArray(raw) || raw.length !== nights) {
    return Array<T>(nights).fill(fallback)
  }
  return raw.map((v): T => (isValid(v) ? v : fallback))
}

// --- 各フィールドの型ガード ---

type DinnerTimeValue = (typeof DINNER_TIME_VALUES)[number]
const isDinnerTime = (v: unknown): v is DinnerTimeValue =>
  (DINNER_TIME_VALUES as ReadonlyArray<unknown>).includes(v)

type BreakfastTimeValue = (typeof BREAKFAST_TIME_VALUES)[number] | null
const isBreakfastTime = (v: unknown): v is BreakfastTimeValue =>
  v === null || (BREAKFAST_TIME_VALUES as ReadonlyArray<unknown>).includes(v)

type OpenAirBathTimeValue = (typeof OPEN_AIR_BATH_TIME_VALUES)[number] | null
const isOpenAirBathTime = (v: unknown): v is OpenAirBathTimeValue =>
  v === null || (OPEN_AIR_BATH_TIME_VALUES as ReadonlyArray<unknown>).includes(v)

const isString = (v: unknown): v is string => typeof v === 'string'

function toReservation(id: string, data: FirebaseFirestore.DocumentData): Reservation {
  try {
    const parsed = FirestoreReservationSchema.parse(data)
    const checkIn = toIsoDate(parsed.check_in_date)
    const checkOut = toIsoDate(parsed.check_out_date)
    const nights = calcNights(checkIn, checkOut)

    return {
      id,
      check_in_date: checkIn,
      check_out_date: checkOut,
      adult_count: parsed.adult_count,
      child_count: parsed.child_count,
      room: parsed.room,
      cancel: parsed.cancel,
      late_out: parsed.late_out,
      guest_name: parsed.guest_name,
      arrival_time: parsed.arrival_time,
      dinner_time: normalizeArray(parsed.dinner_time, nights, isDinnerTime, 'NONE' as DinnerTimeValue),
      breakfast_time: normalizeArray(parsed.breakfast_time, nights, isBreakfastTime, null),
      open_air_bath_time: normalizeArray(parsed.open_air_bath_time, nights, isOpenAirBathTime, null),
      timetable_info: normalizeArray(parsed.timetable_info, nights, isString, ''),
    }
  } catch (e) {
    if (e instanceof ZodError) {
      const detail = e.issues
        .map((issue) => {
          const received = 'received' in issue ? ` (received: ${JSON.stringify(issue.received)})` : ''
          return `${issue.path.join('.')}: ${issue.message}${received}`
        })
        .join(' | ')
      throw new InfraError('FIRESTORE_DATA_CORRUPTION', `Schema validation failed for doc ${id} [${detail}]`, e)
    }
    throw e
  }
}
