// @vitest-environment node
//
// 制約の突き合わせ
// 予約の1フィールドの制約は「UI の選択肢・Route の Zod・Infra の読み取り検証」に分かれて書かれている。
// 判定: UI が送る値はすべて Route を通り、Infra の読み取りで fallback に置き換えられない（受け付けたものは消えない）。
import { describe, it, expect } from 'vitest'
import { ReservationPatchBodySchema, NewReservationBodySchema } from '@/lib/api/reservationSchemas'
import { toReservation } from '@/infra/reservation/firestoreReservationRepository'
import { ROOM_NUMBERS } from '@/constants/room'
import {
  ageOptions, arrivalOptions, bookingSiteOptions, breakfastOptions, countOptions, countryOptions,
  dinnerTimeOptions, groupOptions, lateCOOptions, purposeOptions, rotenOptions, tourismOptions,
  OPEN_AIR_BATH_TIME_VALUES,
} from '@/constants/guestInfo'
import { OPEN_AIR_TIMES_EVENING, OPEN_AIR_TIMES_MORNING } from '@/constants/timetable'
import type { Reservation } from '@/types/reservation'
import { setupFakeToday } from '@tests/utils/routeTestHelper'

// 1泊・大人2名の Firestore ドキュメント
const baseDoc = {
  check_in_date: '2026/11/10',
  check_out_date: '2026/11/11',
  adult_count: 2,
  child_count: 0,
  room: '21',
  cancel: 0,
}

// UI は空の選択肢（'' = 未定・不明）を null にして送る（ReservationEditorList / ReservationCardSet2 の onChange）
const asSent = (v: string) => v || null

type Case = {
  field: keyof Reservation
  sent: unknown              // UI が送る値（PATCH body のそのフィールド）
  stored?: unknown           // Firestore に入る値（省略時は sent と同じ）
}

function cases(field: keyof Reservation, values: unknown[], toStored?: (v: unknown) => unknown): Case[] {
  return values.map((sent) => ({ field, sent, stored: toStored ? toStored(sent) : sent }))
}

const values = <T extends { value: unknown }>(options: readonly T[]): T['value'][] => options.map((o) => o.value)

const patchCases: Case[] = [
  ...cases('arrival_time', [...values(arrivalOptions), null]),
  ...cases('dinner_time', values(dinnerTimeOptions).map((v) => [v])),
  ...cases('breakfast_time', [...values(breakfastOptions), null].map((v) => [v])),
  ...cases('open_air_bath_time', [...values(rotenOptions), null].map((v) => [v])),
  ...cases('late_out', values(lateCOOptions)),
  ...cases('room', [...ROOM_NUMBERS, null]),
  ...cases('child_count', values(countOptions)),
  ...cases('group_type', values(groupOptions).map(asSent)),
  ...cases('purpose', values(purposeOptions).map(asSent)),
  ...cases('tourism_type', values(tourismOptions).map(asSent)),
  ...cases('country', values(countryOptions).map(asSent)),
  ...cases('age_groups', values(ageOptions).map((v) => [asSent(v), null])),
]

describe('PATCH: UI が送る値は Route を通り、Infra の読み取りで消えない', () => {
  it.each(patchCases.map((c) => [c.field, JSON.stringify(c.sent), c] as const))('%s = %s', (_f, _v, c) => {
    expect(ReservationPatchBodySchema.safeParse({ [c.field]: c.sent }).success).toBe(true)
    const read = toReservation('doc1', { ...baseDoc, [c.field]: c.stored })
    expect(read[c.field]).toEqual(c.sent)
  })

  // 大人の人数は age_groups の長さと連動するため、UI と同じく age_groups も一緒に送る
  it.each(values(countOptions))('adult_count = %i', (n) => {
    const ageGroups = Array<null>(n).fill(null)
    expect(ReservationPatchBodySchema.safeParse({ adult_count: n, age_groups: ageGroups }).success).toBe(true)
    const read = toReservation('doc1', { ...baseDoc, adult_count: n, age_groups: ageGroups })
    expect(read.adult_count).toBe(n)
    expect(read.age_groups).toEqual(ageGroups)
  })
})

describe('POST: UI が送る値は Route を通り、Infra の読み取りで消えない', () => {
  // POST の日付は今日（JST）基準の範囲チェックがあるので、今日を 2026-05-20 に固定する
  setupFakeToday()
  const body = {
    check_in_date: '2026-06-10',
    check_out_date: '2026-06-11',
    room: '21',
    adult_count: 2,
    child_count: 0,
    guest_name: 'x',
    booking_site: 'chillnn',
    add_reason: 'x',
    staff_name: 'x',
  }

  it.each(values(bookingSiteOptions))('booking_site = %s', (site) => {
    expect(NewReservationBodySchema.safeParse({ ...body, booking_site: site }).success).toBe(true)
    expect(toReservation('doc1', { ...baseDoc, booking_site: site }).booking_site).toBe(site)
  })
})

// 露天の許容値は、タイムテーブルの夕方・朝の列のどちらかに必ず出る（以前は朝の 9:30 を保存できたが、印刷に出なかった）
describe('露天: 許容値はすべてタイムテーブルの列にある', () => {
  const columns: readonly string[] = [...OPEN_AIR_TIMES_EVENING, ...OPEN_AIR_TIMES_MORNING]

  it.each([...OPEN_AIR_BATH_TIME_VALUES])('%s', (time) => {
    expect(columns).toContain(time)
  })

  it('画面の選択肢は許容値と同じ', () => {
    expect(values(rotenOptions)).toEqual([...OPEN_AIR_BATH_TIME_VALUES])
  })
})
