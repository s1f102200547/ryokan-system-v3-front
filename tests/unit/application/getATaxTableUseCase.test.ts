// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { Reservation } from '@/types/reservation'

const reservation: Reservation = {
  id: 'r1', check_in_date: '2026-05-10', check_out_date: '2026-05-12', adult_count: 2, child_count: 1,
  room: '21', cancel: 0, late_out: 0, guest_name: 'ゲスト', arrival_time: '15:00',
  dinner_time: ['NONE', 'NONE'], dinner_info: ['', ''], breakfast_time: [null, null],
  open_air_bath_time: [null, null], timetable_info: ['メモ', ''], reservation_number: 'rn-1',
  booking_site: 'booking.com', mail_memo: [{ month: '5', day: '1', name: 'n', summary: 's', text: '本文', source: 'booking' }],
  a_tax_received: true, a_tax_received_by_staff_name: '受領者', check_in_staff_name: 'CI担当',
  country: 'JP', city: '東京', age_groups: ['20s', '30s'], group_type: 'couple', purpose: 'tourism',
  tourism_type: 'normal', profession: '会社員', other_note: 'その他メモ',
}

vi.mock('@/infra/reservation/firestoreReservationRepository', () => ({
  firestoreReservationRepository: { fetchByMonth: vi.fn(async () => [reservation, { ...reservation, id: 'r2', cancel: 1 }]) },
}))
vi.mock('@/infra/daily/firestoreDailyRepository', () => ({
  firestoreDailyRepository: { fetchSafeBalanceCheckers: vi.fn(async () => ({ '2026-05-10': '締め' })) },
}))
import { getATaxTableUseCase } from '@/application/aTaxTable/getATaxTableUseCase'

describe('getATaxTableUseCase', () => {
  // 宿泊税の表に要る項目だけを返す。メールメモ・その他メモ・国などの個人情報を API で出さない
  it('行は表に出す項目だけ', async () => {
    const { rows } = await getATaxTableUseCase(2026, 5)
    expect(rows).toEqual([{
      id: 'r1', cancel: 0, check_in_date: '2026-05-10', room: '21', guest_name: 'ゲスト', adult_count: 2,
      booking_site: 'booking.com', a_tax_received: true, a_tax_received_by_staff_name: '受領者',
      nights: 2, tax: 800,
    }])
  })

  it('締めスタッフ名を C/I 日ごとに返す', async () => {
    const { safeBalanceCheckers } = await getATaxTableUseCase(2026, 5)
    expect(safeBalanceCheckers).toEqual({ '2026-05-10': '締め' })
  })
})
