import { describe, it, expect } from 'vitest'
import { validateReservationPatch } from '@/domain/reservation/validateReservationPatch'
import type { ReservationPatch, StayFacts } from '@/types/guestInfo'

// 2泊・大人2名
const current: StayFacts = { check_in_date: '2026-10-31', check_out_date: '2026-11-02', adult_count: 2 }

const nightFields = (nights: number): ReservationPatch => ({
  dinner_time: Array(nights).fill('NONE'),
  dinner_info: Array(nights).fill(''),
  breakfast_time: Array(nights).fill(null),
  open_air_bath_time: Array(nights).fill(null),
  timetable_info: Array(nights).fill(''),
})

function violationCodes(c: StayFacts, patch: ReservationPatch): string[] {
  const result = validateReservationPatch(c, patch)
  return result.success ? [] : [...new Set(result.error.map((v) => v.code))]
}

describe('validateReservationPatch', () => {
  describe('泊数に関係しない patch', () => {
    it('ゲスト名だけの変更は通る', () => {
      expect(validateReservationPatch(current, { guest_name: 'x' })).toEqual({ success: true, value: undefined })
    })

    it('今の C/O が壊れている予約（逆転）は、C/O を直さない変更を拒否する', () => {
      const broken = { ...current, check_out_date: '2026-10-03' }
      expect(violationCodes(broken, { guest_name: 'x' })).toEqual(['CHECK_OUT_NOT_AFTER_CHECK_IN'])
    })
  })

  describe('C/O 日', () => {
    it('C/I と同日は拒否する（泊数 0）', () => {
      expect(violationCodes(current, { check_out_date: '2026-10-31', ...nightFields(0) }))
        .toContain('CHECK_OUT_NOT_AFTER_CHECK_IN')
    })

    it('C/I より前は拒否する（泊数が負）', () => {
      expect(violationCodes(current, { check_out_date: '2026-10-03' })).toContain('CHECK_OUT_NOT_AFTER_CHECK_IN')
    })

    it('1泊に縮めて、泊別配列を1泊分で送れば通る', () => {
      expect(violationCodes(current, { check_out_date: '2026-11-01', ...nightFields(1) })).toEqual([])
    })

    // 長期滞在の上限は 30 泊（取得窓が前後 30 日のため、31 泊以上は画面に出ない）
    it('30 泊は通る', () => {
      expect(violationCodes(current, { check_out_date: '2026-11-30', ...nightFields(30) })).toEqual([])
    })

    it('31 泊は拒否する', () => {
      expect(violationCodes(current, { check_out_date: '2026-12-01', ...nightFields(31) })).toEqual(['TOO_MANY_NIGHTS'])
    })

    it('今の予約が 31 泊以上でも、30 泊以内に直す更新は通る（修正手段）', () => {
      const long = { ...current, check_out_date: '2027-12-31' }
      expect(violationCodes(long, { check_out_date: '2026-11-03', ...nightFields(3) })).toEqual([])
      expect(violationCodes(long, { guest_name: 'x' })).toEqual(['TOO_MANY_NIGHTS'])
    })

    it('泊数が変わるのに泊別配列がないものは拒否する', () => {
      expect(violationCodes(current, { check_out_date: '2026-11-03' })).toEqual(['NIGHT_FIELDS_REQUIRED'])
    })

    it('泊数が変わるのに泊別配列が一部だけのときも拒否する', () => {
      const { dinner_time } = nightFields(3)
      expect(violationCodes(current, { check_out_date: '2026-11-03', dinner_time })).toEqual(['NIGHT_FIELDS_REQUIRED'])
    })

    it('泊数が変わらない C/O（同じ日付）は泊別配列なしで通る', () => {
      expect(violationCodes(current, { check_out_date: '2026-11-02' })).toEqual([])
    })

    it('今の C/O が壊れている予約でも、正しい C/O と泊別配列を送れば通る（修正手段）', () => {
      const broken = { ...current, check_out_date: '2026-10-03' }
      expect(violationCodes(broken, { check_out_date: '2026-11-01', ...nightFields(1) })).toEqual([])
    })
  })

  describe('泊別配列の長さ', () => {
    it('泊数と同じ長さなら通る', () => {
      expect(violationCodes(current, { dinner_time: ['18:00', 'NONE'] })).toEqual([])
    })

    it.each([
      ['dinner_time', ['18:00']],
      ['dinner_info', ['', '', '']],
      ['breakfast_time', []],
      ['open_air_bath_time', [null]],
      ['timetable_info', ['', '', '']],
    ] as const)('%s の長さが泊数と違うと拒否する', (field, value) => {
      expect(violationCodes(current, { [field]: value })).toEqual(['NIGHT_FIELD_LENGTH_MISMATCH'])
    })

    it('C/O を変えたときは、変更後の泊数と比べる', () => {
      expect(violationCodes(current, { check_out_date: '2026-11-03', ...nightFields(2) }))
        .toEqual(['NIGHT_FIELD_LENGTH_MISMATCH'])
    })
  })

  describe('age_groups と大人の人数', () => {
    it('大人の人数と同じ長さなら通る', () => {
      expect(violationCodes(current, { age_groups: ['20s', null] })).toEqual([])
    })

    it('長さが違うと拒否する', () => {
      expect(violationCodes(current, { age_groups: ['20s'] })).toEqual(['AGE_GROUPS_LENGTH_MISMATCH'])
    })

    it('大人の人数を変えたときは、変更後の人数と比べる', () => {
      expect(violationCodes(current, { adult_count: 3, age_groups: [null, null, null] })).toEqual([])
      expect(violationCodes(current, { adult_count: 3, age_groups: [null, null] }))
        .toEqual(['AGE_GROUPS_LENGTH_MISMATCH'])
    })

    it('大人 0 人にするときは空配列で通る', () => {
      expect(violationCodes(current, { adult_count: 0, age_groups: [] })).toEqual([])
    })

    it('大人の人数が変わるのに age_groups がないものは拒否する', () => {
      expect(violationCodes(current, { adult_count: 3 })).toEqual(['AGE_GROUPS_REQUIRED'])
    })

    it('大人の人数が変わらない値なら age_groups なしで通る', () => {
      expect(violationCodes(current, { adult_count: 2 })).toEqual([])
    })
  })
})
