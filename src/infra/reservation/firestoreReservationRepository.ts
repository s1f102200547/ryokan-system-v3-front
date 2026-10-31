import { ZodError, z } from 'zod'
import { v7 as uuidv7 } from 'uuid'
import { adminDb } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'
import { withFirestoreError } from '@/infra/firestoreError'
import { reportSkippedReservations } from '@/lib/skippedReservationReporter'
import type { SkippedReservation } from '@/lib/skippedReservationReporter'
import { ROOM_NUMBERS } from '@/types/room'
import type { ReservationRepository } from '@/domain/ports/reservationRepository'
import type { Reservation } from '@/types/reservation'
import type { Result } from '@/types/result'
import type {
  ATaxPatch, BookingSite, CancelStateFailure, MailMemoEntry, NewReservationInput, ReservationPatch, StayFacts,
} from '@/types/guestInfo'
import {
  MAX_NIGHTS, ARRIVAL_TIME_VALUES, BREAKFAST_TIME_VALUES, DINNER_TIME_VALUES, OPEN_AIR_BATH_TIME_VALUES,
} from '@/constants/guestInfo'
import { dateDiff } from '@/lib/dateUtils'

// --- バリデーション用定数（Firestore 値の許容範囲） ---
// 時刻の許容値は Route の入口検証と共通（src/constants/guestInfo.ts）

const KNOWN_BOOKING_SITES = ['chillnn', 'booking.com', 'expedia'] as const

// --- Firestoreドキュメントのバリデーションスキーマ ---
// 基本フィールド: ZodError になりうる（= FIRESTORE_DATA_CORRUPTION の対象）
// 配列フィールド: 後述の normalizeArray で明示的に補完・変換する

const FirestoreReservationSchema = z.object({
  check_in_date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/),
  adult_count: z.number().int().min(0).max(9),
  child_count: z.number().int().min(0).max(9),
  // "" は未割り当てとして null に変換し、7部屋番号 or null のみ許可
  room: z
    .preprocess((v) => (v === '' ? null : v), z.enum(ROOM_NUMBERS).nullable())
    .default(null),
  cancel: z.number().int().nullish().transform((v) => (v === 1 ? 1 : 0)),
  late_out: z.number().int().nullish().transform((v) => (v === 1 ? 1 : 0)),
  // 欠損 or 不正 → ""
  guest_name: z.string().max(100).catch(''),
  // 定義外 or 欠損 → null（Zod v4 でキー欠損を吸収するため .default(null) が必要）
  arrival_time: z.enum(ARRIVAL_TIME_VALUES).nullable().default(null).catch(null),
  // 配列フィールドは unknown で受け取り、normalizeArray で処理
  dinner_time: z.unknown().optional(),
  dinner_info: z.unknown().optional(),
  breakfast_time: z.unknown().optional(),
  open_air_bath_time: z.unknown().optional(),
  timetable_info: z.unknown().optional(),
})

const MailMemoEntrySchema = z.object({
  month: z.string(),
  day: z.string(),
  name: z.string(),
  summary: z.string(),
  text: z.string(),
  source: z.string(),
}).transform((v): MailMemoEntry => v)

export const firestoreReservationRepository: ReservationRepository = {
  async fetchByDateRange(from, to) {
    return withFirestoreError(async () => {
      const snapshot = await adminDb
        .collection('guestInfoV2')
        .where('check_in_date', '>=', toFirestoreDate(from))
        .where('check_in_date', '<=', toFirestoreDate(to))
        .get()
      return toReservations(snapshot.docs)
    })
  },

  async fetchByMonth(year, month) {
    return withFirestoreError(async () => {
      const from = `${year}/${String(month).padStart(2, '0')}/01`
      const nextMonth = month === 12
        ? `${year + 1}/01/01`
        : `${year}/${String(month + 1).padStart(2, '0')}/01`
      const snapshot = await adminDb
        .collection('guestInfoV2')
        .where('check_in_date', '>=', from)
        .where('check_in_date', '<', nextMonth)
        .get()
      return toReservations(snapshot.docs)
    })
  },

  async cancelReservation(id, mailMemoEntry) {
    return setCancelWithMemo(id, 1, mailMemoEntry)
  },

  async restoreReservation(id, mailMemoEntry) {
    return setCancelWithMemo(id, 0, mailMemoEntry)
  },

  async addReservation(input: NewReservationInput, initialMailMemo: MailMemoEntry) {
    return withFirestoreError(async () => {
      const reservationNumber = uuidv7()
      await adminDb.collection('guestInfoV2').add({
        reservation_number: reservationNumber,
        check_in_date: toFirestoreDate(input.check_in_date),
        check_out_date: toFirestoreDate(input.check_out_date),
        room: input.room,
        adult_count: input.adult_count,
        child_count: input.child_count,
        guest_name: input.guest_name,
        booking_site: input.booking_site,
        cancel: 0,
        source: 'manual',
        mail_memo: [initialMailMemo],
      })
      return reservationNumber
    })
  },

  // 読み取り・検査・書き込みを1つのトランザクションで行う。
  // 検査と書き込みの間に別の更新で泊数が変わっても、古い泊数で検査した配列を書き込まない（BugHunting.md Step 2）
  async updateReservation(id, patch: ReservationPatch, validate) {
    return withFirestoreError(async () => {
      const ref = adminDb.collection('guestInfoV2').doc(id)
      return adminDb.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref)
        const data = snapshot.data()
        if (data === undefined) return { success: false, error: { kind: 'NOT_FOUND' } } as const

        const checked = validate(toStayFacts(id, data))
        if (!checked.success) {
          return { success: false, error: { kind: 'INVALID', violations: checked.error } } as const
        }

        const firestorePatch: Record<string, unknown> = { ...patch }
        if (patch.check_out_date !== undefined) {
          firestorePatch.check_out_date = toFirestoreDate(patch.check_out_date)
        }
        tx.update(ref, firestorePatch as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>)
        return { success: true, value: undefined } as const
      })
    })
  },

  async updateATax(id, patch: ATaxPatch) {
    if (Object.keys(patch).length === 0) return
    return withFirestoreError(async () => {
      await adminDb.collection('guestInfoV2').doc(id).update(
        patch as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
      )
    })
  },
}

// --- ユーティリティ ---

// YYYY-MM-DD → YYYY/MM/DD（Firestoreのフォーマットに合わせる）
function toFirestoreDate(date: string): string {
  return date.replace(/-/g, '/')
}

// YYYY/MM/DD → YYYY-MM-DD（domain層のフォーマットに統一）
function toIsoDate(date: string): string {
  return date.replace(/\//g, '-')
}

function normalizeBookingSite(raw: unknown): BookingSite {
  if (typeof raw !== 'string') return 'other'
  const lower = raw.toLowerCase()
  return (KNOWN_BOOKING_SITES as ReadonlyArray<string>).includes(lower)
    ? (lower as BookingSite)
    : 'other'
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
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'

// キャンセル・復活の状態を変え、操作履歴（mail_memo）の末尾に1件追加する。
// FieldValue.arrayUnion は同じ内容の要素を追加しないため、同じ日・同じスタッフ・同じ理由で
// キャンセルと復活を繰り返すと履歴が残らなかった。トランザクションで読んで末尾に足す（BugHunting.md #25）。
// すでにその状態なら何も書かない。古い画面からの操作で、状態が変わらないのに履歴と通知が増えていた（#27）
async function setCancelWithMemo(
  id: string,
  cancel: 0 | 1,
  mailMemoEntry: MailMemoEntry,
): Promise<Result<void, CancelStateFailure>> {
  return withFirestoreError(async () => {
    const ref = adminDb.collection('guestInfoV2').doc(id)
    return adminDb.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data()
      if (data === undefined) throw new InfraError('FIRESTORE_NOT_FOUND', `Reservation not found: ${id}`)
      // cancel は 1 だけをキャンセル済みとして扱う（読み取りの正規化と同じ）
      const current = data.cancel === 1 ? 1 : 0
      if (current === cancel) return { success: false, error: { kind: 'ALREADY_IN_STATE' } } as const
      // 履歴が配列でない（壊れている）ときは、新しい1件から始める
      const memo: unknown[] = Array.isArray(data.mail_memo) ? data.mail_memo : []
      tx.update(ref, { cancel, mail_memo: [...memo, mailMemoEntry] })
      return { success: true, value: undefined } as const
    })
  })
}

// 取得したドキュメントを予約に変換する。破損したものは読み飛ばし、他の予約の取得を巻き込まない（BugHunting.md #4, #10）
function toReservations(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Reservation[] {
  const skipped: SkippedReservation[] = []
  const reservations = docs.flatMap((doc) => {
    try {
      return [toReservation(doc.id, doc.data())]
    } catch (e) {
      if (e instanceof InfraError && e.code === 'FIRESTORE_DATA_CORRUPTION') {
        skipped.push({ id: doc.id, reason: e.message })
        return []
      }
      throw e
    }
  })
  reportSkippedReservations(skipped)
  return reservations
}

// 更新の検査に使う項目だけを読む。check_out_date が C/I 以前でも読める（壊れた予約の C/O を直す更新を通すため）
const StayFactsSchema = FirestoreReservationSchema.pick({
  check_in_date: true,
  check_out_date: true,
  adult_count: true,
})

function toStayFacts(id: string, data: FirebaseFirestore.DocumentData): StayFacts {
  const parsed = StayFactsSchema.safeParse(data)
  if (!parsed.success) {
    throw new InfraError('FIRESTORE_DATA_CORRUPTION', `Stay facts unreadable for doc ${id}`, parsed.error)
  }
  return {
    check_in_date: toIsoDate(parsed.data.check_in_date),
    check_out_date: toIsoDate(parsed.data.check_out_date),
    adult_count: parsed.data.adult_count,
  }
}

export function toReservation(id: string, data: FirebaseFirestore.DocumentData): Reservation {
  try {
    const parsed = FirestoreReservationSchema.parse(data)
    const checkIn = toIsoDate(parsed.check_in_date)
    const checkOut = toIsoDate(parsed.check_out_date)
    const nights = dateDiff(checkIn, checkOut)
    // 泊数 0 以下は泊別配列を作れない（負だと Array(nights) が RangeError）。破損として読み飛ばさせる（BugHunting.md #4）
    if (nights < 1) {
      throw new InfraError(
        'FIRESTORE_DATA_CORRUPTION',
        `Schema validation failed for doc ${id} [check_out_date: not after check_in_date (nights: ${nights})]`,
      )
    }
    // 上限を超える滞在は画面の取得窓に収まらない。入口でも拒否している（BugHunting.md #12）
    if (nights > MAX_NIGHTS) {
      throw new InfraError(
        'FIRESTORE_DATA_CORRUPTION',
        `Schema validation failed for doc ${id} [check_out_date: more than ${MAX_NIGHTS} nights (nights: ${nights})]`,
      )
    }

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
      dinner_info: normalizeArray(parsed.dinner_info, nights, isString, ''),
      breakfast_time: normalizeArray(parsed.breakfast_time, nights, isBreakfastTime, null),
      open_air_bath_time: normalizeArray(parsed.open_air_bath_time, nights, isOpenAirBathTime, null),
      timetable_info: normalizeArray(parsed.timetable_info, nights, isString, ''),
      reservation_number: z.string().catch('').parse(data.reservation_number ?? ''),
      booking_site: normalizeBookingSite(data.booking_site),
      mail_memo: z.array(z.unknown()).catch([]).parse(data.mail_memo ?? []).flatMap((entry) => {
        const result = MailMemoEntrySchema.safeParse(entry)
        return result.success ? [result.data] : []
      }),
      a_tax_received: z.boolean().catch(false).parse(data.a_tax_received ?? false),
      a_tax_received_by_staff_name: z.string().max(100).catch('').parse(data.a_tax_received_by_staff_name ?? ''),
      check_in_staff_name: z.string().max(100).catch('').parse(data.check_in_staff_name ?? ''),
      country: z.string().nullable().catch(null).parse(data.country || null),
      city: z.string().max(100).catch('').parse(data.city ?? ''),
      age_groups: normalizeArray(data.age_groups, parsed.adult_count, isStringOrNull, null),
      group_type: z.string().nullable().catch(null).parse(data.group_type || null),
      purpose: z.string().nullable().catch(null).parse(data.purpose || null),
      tourism_type: z.string().nullable().catch(null).parse(data.tourism_type || null),
      profession: z.string().catch('').parse(data.profession ?? ''),
      other_note: z.string().catch('').parse(data.other_note ?? ''),
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
