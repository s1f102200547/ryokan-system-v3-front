import { z } from 'zod'
import { ROOM_NUMBERS } from '@/constants/room'
import {
  MAX_ADULT_COUNT, MAX_NIGHTS, RESERVATION_LIMITS as L, ARRIVAL_TIME_VALUES, BREAKFAST_TIME_VALUES, DINNER_TIME_VALUES, OPEN_AIR_BATH_TIME_VALUES,
} from '@/constants/guestInfo'
import { DateSchema } from '@/lib/api/dateSchema'
import { dateDiff } from '@/lib/dateUtils'

// 予約 API の入口検証。Route Handler のファイルは HTTP メソッド以外を export できないため、ここに置く。
// 制約の突き合わせテスト（tests/unit/constraints/）と往復検査（tests/emulator/）からも参照する

// --- PATCH /api/reservations/[id] ---

// 文字列と配列の上限は src/constants/guestInfo.ts の RESERVATION_LIMITS。読み取り（Infra）には入れない
const MailMemoEntrySchema = z.object({
  month:   z.string().max(L.mailMemoMonthDayLength),
  day:     z.string().max(L.mailMemoMonthDayLength),
  name:    z.string().max(L.mailMemoNameLength),
  summary: z.string().max(L.mailMemoSummaryLength),
  text:    z.string().max(L.mailMemoTextLength),
  source:  z.string().max(L.mailMemoSourceLength),
})

const SelectValueSchema = z.string().max(L.selectValueLength)

// ReservationPatch の部分更新を受け付ける（全フィールドoptional）
// 値の許容範囲は Infra の読み取り検証と揃える。泊数・配列の長さは既存の予約と合わせて Command で検査する
export const ReservationPatchBodySchema = z.object({
  guest_name:                    z.string().max(100).optional(),
  room:                          z.enum(ROOM_NUMBERS).nullable().optional(),
  adult_count:                   z.number().int().min(0).max(MAX_ADULT_COUNT).optional(),
  child_count:                   z.number().int().min(0).max(9).optional(),
  check_out_date:                DateSchema.optional(),
  arrival_time:                  z.enum(ARRIVAL_TIME_VALUES).nullable().optional(),
  late_out:                      z.number().int().min(0).max(1).optional(),
  dinner_time:                   z.array(z.enum(DINNER_TIME_VALUES)).max(MAX_NIGHTS).optional(),
  dinner_info:                   z.array(z.string().max(L.dinnerInfoLength)).max(MAX_NIGHTS).optional(),
  breakfast_time:                z.array(z.enum(BREAKFAST_TIME_VALUES).nullable()).max(MAX_NIGHTS).optional(),
  open_air_bath_time:            z.array(z.enum(OPEN_AIR_BATH_TIME_VALUES).nullable()).max(MAX_NIGHTS).optional(),
  timetable_info:                z.array(z.string().max(L.timetableInfoLength)).max(MAX_NIGHTS).optional(),
  mail_memo:                     z.array(MailMemoEntrySchema).max(L.mailMemoItems).optional(),
  a_tax_received:                z.boolean().optional(),
  a_tax_received_by_staff_name:  z.string().max(100).optional(),
  check_in_staff_name:           z.string().max(100).optional(),
  country:                       z.string().max(100).nullable().optional(),
  city:                          z.string().max(100).optional(),
  age_groups:                    z.array(SelectValueSchema.nullable()).max(MAX_ADULT_COUNT).optional(),
  group_type:                    SelectValueSchema.nullable().optional(),
  purpose:                       SelectValueSchema.nullable().optional(),
  tourism_type:                  SelectValueSchema.nullable().optional(),
  profession:                    z.string().max(L.professionLength).optional(),
  other_note:                    z.string().max(L.otherNoteLength).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'patch must not be empty' })

// --- POST /api/reservations ---

export const BOOKING_SITES = ['chillnn', 'booking.com', 'expedia', 'other'] as const

export const NewReservationBodySchema = z.object({
  check_in_date: DateSchema,
  check_out_date: DateSchema,
  room: z.enum(ROOM_NUMBERS),
  adult_count: z.number().int().min(0).max(9),
  child_count: z.number().int().min(0).max(9),
  guest_name: z.string().min(1).max(100),
  booking_site: z.enum(BOOKING_SITES),
  add_reason: z.string().min(1).max(500),
  staff_name: z.string().min(1).max(100),
}).refine((d) => d.check_out_date > d.check_in_date, {
  message: 'check_out_date must be after check_in_date',
}).refine((d) => dateDiff(d.check_in_date, d.check_out_date) <= MAX_NIGHTS, {
  message: `stay must be at most ${MAX_NIGHTS} nights`,
})
