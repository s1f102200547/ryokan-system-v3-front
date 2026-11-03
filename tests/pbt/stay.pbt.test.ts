// PBT: 部屋の状態・部屋の重複・宿泊税の集計の性質
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { computeRoomCheckInState } from '@/domain/room/roomState'
import { findRoomConflicts } from '@/domain/room/roomConflicts'
import { computeProcessedRows } from '@/components/aTaxTable/ReservationTable'
import { dateDiff } from '@/lib/dateUtils'
import { ROOM_NUMBERS } from '@/constants/room'
import { nearbyReservation } from '@tests/utils/arbitraries'
import type { Reservation } from '@/types/reservation'

const TARGET = '2026-05-20'
const reservations = fc.array(nearbyReservation(TARGET), { maxLength: 12 })
const occupiesNight = (r: Reservation, d: string) =>
  r.cancel !== 1 && r.check_in_date <= d && d < r.check_out_date

describe('部屋の状態（computeRoomCheckInState）', () => {
  it('対象日に滞在中か C/I の有効な予約があれば、空室ではない', () => {
    fc.assert(fc.property(reservations, fc.constantFrom(...ROOM_NUMBERS), (rs, room) => {
      const state = computeRoomCheckInState(rs, TARGET, room)
      const occupied = rs.some((r) => r.room === room && occupiesNight(r, TARGET))
      expect(state.isTodayVacant).toBe(!occupied)
    }), { numRuns: 1000 })
  })

  it('滞在中（stayingReservation）は C/I 日でも C/O 日でもない', () => {
    fc.assert(fc.property(reservations, fc.constantFrom(...ROOM_NUMBERS), (rs, room) => {
      const s = computeRoomCheckInState(rs, TARGET, room).stayingReservation
      if (s) {
        expect(s.check_in_date < TARGET && TARGET < s.check_out_date).toBe(true)
        expect(s.cancel).not.toBe(1)
        expect(s.room).toBe(room)
      }
    }), { numRuns: 1000 })
  })
})

describe('部屋の重複（findRoomConflicts）', () => {
  it('重複と報告した部屋は有効な予約が2件以上、報告しなかった部屋は1件以下', () => {
    fc.assert(fc.property(reservations, (rs) => {
      const conflicts = findRoomConflicts(rs, TARGET)
      for (const room of ROOM_NUMBERS) {
        const ids = rs.filter((r) => r.room === room && occupiesNight(r, TARGET)).map((r) => r.id)
        const reported = conflicts.find((c) => c.room === room)
        if (ids.length >= 2) expect(reported?.reservationIds.slice().sort()).toEqual(ids.slice().sort())
        else expect(reported).toBeUndefined()
      }
    }), { numRuns: 1000 })
  })
})

describe('宿泊税テーブルの集計（computeProcessedRows）', () => {
  const rows = reservations.map((rs) => rs.map((r) => {
    const nights = dateDiff(r.check_in_date, r.check_out_date)
    return { ...r, nights, tax: r.adult_count * nights * 200 }
  }))

  it('キャンセル済みは含まず、各 C/I 日の最後の行の「大人×泊」の和は、対象（chillnn か受領済み）の大人×泊の和と一致する', () => {
    fc.assert(fc.property(rows, (rs) => {
      const processed = computeProcessedRows(rs, {})
      expect(processed.every((r) => r.cancel !== 1)).toBe(true)
      expect(processed).toHaveLength(rs.filter((r) => r.cancel !== 1).length)
      const sum = processed.reduce((s, r) => s + (r.adultNightSum ?? 0), 0)
      const expected = rs
        .filter((r) => r.cancel !== 1 && (r.booking_site === 'chillnn' || r.a_tax_received))
        .reduce((s, r) => s + r.adult_count * r.nights, 0)
      expect(sum).toBe(expected)
    }), { numRuns: 1000 })
  })

  it('C/I 日ごとに「最後の行」はちょうど1行', () => {
    fc.assert(fc.property(rows, (rs) => {
      const processed = computeProcessedRows(rs, {})
      const dates = new Set(processed.map((r) => r.check_in_date))
      for (const d of dates) {
        expect(processed.filter((r) => r.check_in_date === d && r.isLastDate)).toHaveLength(1)
      }
    }), { numRuns: 1000 })
  })
})
