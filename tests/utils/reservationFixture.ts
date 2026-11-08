import type { Reservation } from '@/types/reservation'

// UI のテスト用の予約。泊別配列の長さ = 泊数、age_groups の長さ = 大人の人数をそろえて作る
export function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  const base: Reservation = {
    id: 'rsv-1',
    check_in_date: '2026-04-12',
    check_out_date: '2026-04-13',
    adult_count: 2,
    child_count: 0,
    room: '21',
    cancel: 0,
    late_out: 0,
    guest_name: '山田太郎',
    arrival_time: null,
    dinner_time: ['NONE'],
    dinner_info: [''],
    breakfast_time: [null],
    open_air_bath_time: [null],
    timetable_info: [''],
    reservation_number: 'rsv-1',
    booking_site: 'other',
    mail_memo: [],
    a_tax_received: false,
    a_tax_received_by_staff_name: '',
    check_in_staff_name: '',
    country: null,
    city: '',
    age_groups: [null, null],
    group_type: null,
    purpose: null,
    tourism_type: null,
    profession: '',
    other_note: '',
  }
  return { ...base, ...overrides }
}
