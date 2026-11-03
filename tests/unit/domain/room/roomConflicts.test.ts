import { describe, it, expect } from 'vitest'
import { findRoomConflicts } from '@/domain/room/roomConflicts'
import type { Reservation } from '@/types/reservation'

const TARGET_DATE = '2026-04-01'

function makeReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'r1',
    check_in_date: TARGET_DATE,
    check_out_date: '2026-04-02',
    adult_count: 2,
    child_count: 0,
    room: '21',
    cancel: 0,
    late_out: 0,
    guest_name: '',
    arrival_time: null,
    dinner_time: [],
    dinner_info: [],
    breakfast_time: [],
    open_air_bath_time: [],
    timetable_info: [],
    reservation_number: '',
    booking_site: 'other',
    mail_memo: [],
    a_tax_received: false,
    a_tax_received_by_staff_name: '',
    check_in_staff_name: '',
    country: '',
    city: '',
    age_groups: [],
    group_type: '',
    purpose: '',
    tourism_type: '',
    profession: '',
    other_note: '',
    ...overrides,
  }
}

// 同じ部屋・同じ夜に有効な予約が2件あると、2件目は清掃ボード・タイムテーブルに出ない
describe('findRoomConflicts', () => {
  it('同じ部屋に当日 C/I が2件あれば重複', () => {
    const rs = [makeReservation({ id: 'a' }), makeReservation({ id: 'b' })]
    expect(findRoomConflicts(rs, TARGET_DATE)).toEqual([{ room: '21', reservationIds: ['a', 'b'] }])
  })

  it('連泊中と当日 C/I が同じ部屋なら重複', () => {
    const rs = [
      makeReservation({ id: 'a', check_in_date: '2026-03-30', check_out_date: '2026-04-03' }),
      makeReservation({ id: 'b' }),
    ]
    expect(findRoomConflicts(rs, TARGET_DATE)).toEqual([{ room: '21', reservationIds: ['a', 'b'] }])
  })

  it('当日 C/O と当日 C/I は重複ではない（入れ替わり）', () => {
    const rs = [
      makeReservation({ id: 'a', check_in_date: '2026-03-30', check_out_date: TARGET_DATE }),
      makeReservation({ id: 'b' }),
    ]
    expect(findRoomConflicts(rs, TARGET_DATE)).toEqual([])
  })

  it('キャンセル済みと部屋未割り当ては数えない', () => {
    const rs = [
      makeReservation({ id: 'a' }),
      makeReservation({ id: 'b', cancel: 1 }),
      makeReservation({ id: 'c', room: null }),
      makeReservation({ id: 'd', room: null }),
    ]
    expect(findRoomConflicts(rs, TARGET_DATE)).toEqual([])
  })

  it('別の部屋なら重複ではない', () => {
    expect(findRoomConflicts([makeReservation({ id: 'a' }), makeReservation({ id: 'b', room: '22' })], TARGET_DATE)).toEqual([])
  })

  it('未来の C/I は対象日の重複に数えない', () => {
    const rs = [makeReservation({ id: 'a' }), makeReservation({ id: 'b', check_in_date: '2026-04-02', check_out_date: '2026-04-03' })]
    expect(findRoomConflicts(rs, TARGET_DATE)).toEqual([])
  })

  it('3件重なれば3件とも、部屋番号順に返す', () => {
    const rs = [
      makeReservation({ id: 'x', room: '61' }), makeReservation({ id: 'y', room: '61' }),
      makeReservation({ id: 'a' }), makeReservation({ id: 'b' }), makeReservation({ id: 'c' }),
    ]
    expect(findRoomConflicts(rs, TARGET_DATE)).toEqual([
      { room: '21', reservationIds: ['a', 'b', 'c'] },
      { room: '61', reservationIds: ['x', 'y'] },
    ])
  })
})
