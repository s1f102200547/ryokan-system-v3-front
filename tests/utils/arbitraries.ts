// PBT（fast-check）の入力の生成器（BugHunting.md §3.5）
import fc from 'fast-check'
import { addDays } from '@/lib/dateUtils'
import { ROOM_NUMBERS } from '@/constants/room'
import {
  ARRIVAL_TIME_VALUES, BREAKFAST_TIME_VALUES, DINNER_TIME_VALUES, OPEN_AIR_BATH_TIME_VALUES,
} from '@/constants/guestInfo'
import type { Reservation } from '@/types/reservation'

// 実在する YYYY-MM-DD（2000〜2099 年。閏日・月末を含む）
export const isoDate = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10))

// 予約の1フィールドに入りうる、壊れた値（本番データの「形」: 型違い・null・範囲外・巨大な値）
export const junk = fc.oneof(
  fc.constant(null), fc.constant(undefined), fc.constant(''), fc.boolean(),
  fc.integer({ min: -100, max: 100 }), fc.double(), fc.string({ maxLength: 20 }),
  fc.constant([]), fc.constant({}), fc.constant(Number.NaN),
)

export const dinnerTime = fc.constantFrom(...DINNER_TIME_VALUES)
export const breakfastTime = fc.oneof(fc.constantFrom(...BREAKFAST_TIME_VALUES), fc.constant(null))
export const openAirBathTime = fc.oneof(fc.constantFrom(...OPEN_AIR_BATH_TIME_VALUES), fc.constant(null))
export const arrivalTime = fc.oneof(fc.constantFrom(...ARRIVAL_TIME_VALUES), fc.constant(null))
export const room = fc.oneof(fc.constantFrom(...ROOM_NUMBERS), fc.constant(null))

// 同じ月の近い日付に集めた予約（部屋の重複・連泊・C/O 日と C/I 日の入れ替わりが起きやすいように）
export const nearbyReservation = (base: string): fc.Arbitrary<Reservation> =>
  fc.record({
    id: fc.uuid(),
    start: fc.integer({ min: -5, max: 5 }),
    nights: fc.integer({ min: 1, max: 6 }),
    room,
    cancel: fc.constantFrom(0, 1),
    late_out: fc.constantFrom(0, 1),
    adult_count: fc.integer({ min: 0, max: 9 }),
    a_tax_received: fc.boolean(),
    booking_site: fc.constantFrom('chillnn' as const, 'booking.com' as const, 'expedia' as const, 'other' as const),
  }).map((r) => ({
    id: r.id,
    check_in_date: addDays(base, r.start),
    check_out_date: addDays(base, r.start + r.nights),
    adult_count: r.adult_count, child_count: 0, room: r.room, cancel: r.cancel, late_out: r.late_out,
    guest_name: '', arrival_time: null,
    dinner_time: Array(r.nights).fill('NONE'), dinner_info: Array(r.nights).fill(''),
    breakfast_time: Array(r.nights).fill(null), open_air_bath_time: Array(r.nights).fill(null),
    timetable_info: Array(r.nights).fill(''),
    reservation_number: '', booking_site: r.booking_site, mail_memo: [],
    a_tax_received: r.a_tax_received, a_tax_received_by_staff_name: '', check_in_staff_name: '',
    country: null, city: '', age_groups: Array(r.adult_count).fill(null), group_type: null, purpose: null,
    tourism_type: null, profession: '', other_note: '',
  }))
