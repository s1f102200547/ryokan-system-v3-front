// @vitest-environment node
// PBT: 予約データの読み取りと更新の性質
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { toReservation } from '@/infra/reservation/firestoreReservationRepository'
import { validateReservationPatch } from '@/domain/reservation/validateReservationPatch'
import { keepLonger, resizeNightArray, resizeNightFields } from '@/domain/reservation/nightArrays'
import { addDays, dateDiff } from '@/lib/dateUtils'
import { InfraError } from '@/types/errors'
import { ROOM_NUMBERS } from '@/constants/room'
import {
  BREAKFAST_TIME_VALUES, DINNER_TIME_VALUES, OPEN_AIR_BATH_TIME_VALUES, MAX_NIGHTS,
} from '@/constants/guestInfo'
import {
  isoDate, junk, dinnerTime, breakfastTime, openAirBathTime, arrivalTime, room,
} from '@tests/utils/arbitraries'
import type { ReservationPatch } from '@/types/guestInfo'

const toFirestoreDate = (d: string) => d.replace(/-/g, '/')

// 本番データの「形」: 正しい値・壊れた値・欠損が混ざったドキュメント
const arrayOf = <T,>(item: fc.Arbitrary<T>) => fc.oneof(fc.array(fc.oneof(item, junk), { maxLength: 40 }), junk)
const firestoreDoc = fc.record({
  check_in_date: fc.oneof(isoDate.map(toFirestoreDate), isoDate, junk),
  nights: fc.integer({ min: -3, max: 40 }),
  adult_count: fc.oneof(fc.integer({ min: -1, max: 10 }), junk),
  child_count: fc.oneof(fc.integer({ min: 0, max: 9 }), junk),
  room: fc.oneof(room, fc.constant(''), junk),
  cancel: fc.oneof(fc.constantFrom(0, 1), junk),
  arrival_time: fc.oneof(arrivalTime, junk),
  dinner_time: arrayOf(dinnerTime),
  dinner_info: arrayOf(fc.string()),
  breakfast_time: arrayOf(breakfastTime),
  open_air_bath_time: arrayOf(openAirBathTime),
  timetable_info: arrayOf(fc.string()),
  age_groups: arrayOf(fc.oneof(fc.string({ maxLength: 4 }), fc.constant(null))),
  mail_memo: fc.oneof(fc.array(junk, { maxLength: 3 }), junk),
}, { requiredKeys: ['check_in_date', 'nights'] }).map(({ nights, ...doc }) => {
  const ci = typeof doc.check_in_date === 'string' ? doc.check_in_date.replace(/\//g, '-') : ''
  const co = /^\d{4}-\d{2}-\d{2}$/.test(ci) ? toFirestoreDate(addDays(ci, nights)) : doc.check_in_date
  return { ...doc, check_out_date: co }
})

describe('toReservation（どんなドキュメントでも）', () => {
  it('読めたら泊別配列は泊数と、age_groups は大人の人数と同じ長さで、値はすべて許容値。読めなければ FIRESTORE_DATA_CORRUPTION だけ', () => {
    fc.assert(fc.property(firestoreDoc, (doc) => {
      let r
      try {
        r = toReservation('doc', doc)
      } catch (e) {
        expect(e).toBeInstanceOf(InfraError)
        expect((e as InfraError).code).toBe('FIRESTORE_DATA_CORRUPTION')
        return
      }
      const nights = dateDiff(r.check_in_date, r.check_out_date)
      expect(nights).toBeGreaterThanOrEqual(1)
      expect(nights).toBeLessThanOrEqual(MAX_NIGHTS)
      for (const f of ['dinner_time', 'dinner_info', 'breakfast_time', 'open_air_bath_time', 'timetable_info'] as const) {
        expect(r[f]).toHaveLength(nights)
      }
      expect(r.age_groups).toHaveLength(r.adult_count)
      expect(r.dinner_time.every((v) => (DINNER_TIME_VALUES as readonly string[]).includes(v))).toBe(true)
      expect(r.breakfast_time.every((v) => v === null || (BREAKFAST_TIME_VALUES as readonly string[]).includes(v))).toBe(true)
      expect(r.open_air_bath_time.every((v) => v === null || (OPEN_AIR_BATH_TIME_VALUES as readonly string[]).includes(v))).toBe(true)
      expect(r.room === null || (ROOM_NUMBERS as readonly string[]).includes(r.room)).toBe(true)
    }), { numRuns: 3000 })
  })
})

// 受け付けたものは消えない: 更新の検査を通った patch を DB の値に重ねて読み直すと、patch の値がそのまま返る
describe('更新の検査（validateReservationPatch）× 読み取り（toReservation）', () => {
  const current = fc.record({
    ci: isoDate,
    nights: fc.integer({ min: 1, max: MAX_NIGHTS }),
    adult: fc.integer({ min: 0, max: 9 }),
  })
  const patch = fc.record({
    coOffset: fc.option(fc.integer({ min: -2, max: MAX_NIGHTS + 3 }), { nil: undefined, freq: 2 }),
    adult_count: fc.option(fc.integer({ min: 0, max: 9 }), { nil: undefined }),
    // 多くは正しい長さにし、ときどき違う長さにする（検査を通る入力を十分に作るため）
    len: fc.oneof({ weight: 4, arbitrary: fc.constant('correct' as const) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: MAX_NIGHTS + 3 }) }),
    ageLen: fc.oneof({ weight: 4, arbitrary: fc.constant('correct' as const) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 10 }) }),
    withNightFields: fc.boolean(),
    withAgeGroups: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    dinner: dinnerTime, breakfast: breakfastTime, bath: openAirBathTime, arrival: arrivalTime,
  })

  it('検査を通った patch は、読み戻しても同じ値', () => {
    let accepted = 0
    fc.assert(fc.property(current, patch, (c, p) => {
      const stay = { check_in_date: c.ci, check_out_date: addDays(c.ci, c.nights), adult_count: c.adult }
      const body: ReservationPatch = { arrival_time: p.arrival }
      if (p.coOffset !== undefined) body.check_out_date = addDays(c.ci, p.coOffset)
      if (p.adult_count !== undefined) body.adult_count = p.adult_count
      const nights = dateDiff(c.ci, body.check_out_date ?? stay.check_out_date)
      const len = p.len === 'correct' ? Math.max(nights, 0) : p.len
      const ageLen = p.ageLen === 'correct' ? (body.adult_count ?? c.adult) : p.ageLen
      if (p.withNightFields) {
        Object.assign(body, {
          dinner_time: Array(len).fill(p.dinner), dinner_info: Array(len).fill('x'),
          breakfast_time: Array(len).fill(p.breakfast), open_air_bath_time: Array(len).fill(p.bath),
          timetable_info: Array(len).fill('y'),
        })
      }
      if (p.withAgeGroups) body.age_groups = Array(ageLen).fill('30s')
      if (!validateReservationPatch(stay, body).success) return
      accepted++

      const stored = {
        check_in_date: toFirestoreDate(stay.check_in_date),
        check_out_date: toFirestoreDate(body.check_out_date ?? stay.check_out_date),
        adult_count: body.adult_count ?? stay.adult_count, child_count: 0, room: '21', cancel: 0,
        dinner_time: Array(c.nights).fill('NONE'), age_groups: Array(c.adult).fill(null),
        ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'check_out_date' && k !== 'adult_count')),
      }
      const read = toReservation('doc', stored)
      const { check_out_date, ...rest } = body
      expect(read).toMatchObject(rest)
      if (check_out_date) expect(read.check_out_date).toBe(check_out_date)
    }), { numRuns: 3000 })
    // 検査を通る入力が十分にないと、この性質は何も確かめていないことになる
    expect(accepted).toBeGreaterThan(600)
  })
})

describe('泊別配列の伸び縮み', () => {
  const arr = fc.array(fc.string({ maxLength: 3 }), { maxLength: 40 })

  it('伸ばして元の長さに縮めると、元に戻る', () => {
    fc.assert(fc.property(arr, fc.nat(20), (a, k) => {
      expect(resizeNightArray(resizeNightArray(a, a.length + k, 'x'), a.length, 'x')).toEqual(a)
    }))
  })

  it('記憶（keepLonger）があれば、縮めてから伸ばしても元に戻る', () => {
    fc.assert(fc.property(arr, fc.nat(40), (a, s) => {
      const shrunk = resizeNightArray(a, Math.min(s, a.length), 'x')
      expect(resizeNightArray(keepLonger(a, shrunk), a.length, 'x')).toEqual(a)
    }))
  })

  it('resizeNightFields の結果はすべて指定の泊数', () => {
    fc.assert(fc.property(fc.nat(40), fc.nat(40), (from, to) => {
      const fields = resizeNightFields({ dinner_time: Array(from).fill('NONE') }, to)
      for (const v of Object.values(fields)) expect(v).toHaveLength(to)
    }))
  })
})
