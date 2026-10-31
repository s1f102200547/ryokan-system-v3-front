// 往復検査（BugHunting.md §3.1）
// Route Handler → Command → Infra（トランザクション）→ Firestore Emulator に実際に書き、画面と同じ読み取り経路で読み戻す。
// モックは認証（verifySession）と Slack だけ。判定は仕様の中身に依存しない:
//   - Route が受け付けた値は、読み戻しても同じ（fallback に化けない・消えない）
//   - 壊れたドキュメントが1件あっても、他の予約の取得を巻き込まない
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { PATCH } from '@/app/api/reservations/[id]/route'
import { POST } from '@/app/api/reservations/route'
import { adminDb } from '@/lib/firebase/admin'
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { addDays, getTodayJST } from '@/lib/dateUtils'
import { ROOM_NUMBERS } from '@/constants/room'
import {
  ARRIVAL_TIME_VALUES, BREAKFAST_TIME_VALUES, DINNER_TIME_VALUES, OPEN_AIR_BATH_TIME_VALUES,
  ageOptions, bookingSiteOptions, groupOptions, purposeOptions, tourismOptions,
} from '@/constants/guestInfo'
import type { Reservation } from '@/types/reservation'
import type { ReservationPatch } from '@/types/guestInfo'

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn().mockResolvedValue({ uid: 'emulator-test' }) }))
vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

const COLLECTION = 'guestInfoV2'
const RUN_ID = `emutest-${Date.now()}`
const createdIds: string[] = []

// 今日（JST）から 10 日後に C/I する2泊・大人2名。Route の日付の範囲チェックを通る日付にする
const CHECK_IN = addDays(getTodayJST(), 10)
const CHECK_OUT = addDays(CHECK_IN, 2)
const toFirestoreDate = (d: string) => d.replace(/-/g, '/')

function baseDoc(): Record<string, unknown> {
  return {
    reservation_number: RUN_ID,
    check_in_date: toFirestoreDate(CHECK_IN),
    check_out_date: toFirestoreDate(CHECK_OUT),
    adult_count: 2,
    child_count: 0,
    room: '21',
    cancel: 0,
    guest_name: 'emulator test',
    dinner_time: ['NONE', 'NONE'],
    dinner_info: ['', ''],
    breakfast_time: [null, null],
    open_air_bath_time: [null, null],
    timetable_info: ['', ''],
    age_groups: [null, null],
  }
}

async function createDoc(data: Record<string, unknown>): Promise<string> {
  const id = `${RUN_ID}-${createdIds.length}`
  createdIds.push(id)
  await adminDb.collection(COLLECTION).doc(id).set(data)
  return id
}

async function patch(id: string, body: ReservationPatch): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: 'session=emulator-test' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

// 画面（ゲスト情報・タイムテーブル・清掃ボード）と同じ読み取り経路
async function readBack(id: string): Promise<Reservation | undefined> {
  const list = await firestoreReservationRepository.fetchByDateRange(CHECK_IN, CHECK_IN)
  return list.find((r) => r.id === id)
}

beforeAll(() => {
  // 念のため: ローカルの Emulator 以外には書かない
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  expect(process.env.FIREBASE_PROJECT_ID).toMatch(/^demo-/)
})

afterAll(async () => {
  await Promise.all(createdIds.map((id) => adminDb.collection(COLLECTION).doc(id).delete()))
})

// --- PATCH: 受け付けた値は読み戻しても同じ ---

type PatchCase = { label: string; body: ReservationPatch; expected?: Partial<Reservation> }

const each = <T,>(values: readonly T[], f: (v: T) => PatchCase): PatchCase[] => values.map(f)
const json = (v: unknown) => JSON.stringify(v)

const patchCases: PatchCase[] = [
  // 許容値が決まっているフィールド（src/constants/guestInfo.ts）
  ...each([...ARRIVAL_TIME_VALUES, null], (v) => ({ label: `arrival_time ${json(v)}`, body: { arrival_time: v } })),
  ...each(DINNER_TIME_VALUES, (v) => ({ label: `dinner_time ${v}`, body: { dinner_time: [v, 'NONE'] } })),
  ...each([...BREAKFAST_TIME_VALUES, null], (v) => ({ label: `breakfast_time ${json(v)}`, body: { breakfast_time: [v, null] } })),
  ...each([...OPEN_AIR_BATH_TIME_VALUES, null], (v) => ({ label: `open_air_bath_time ${json(v)}`, body: { open_air_bath_time: [null, v] } })),
  ...each([...ROOM_NUMBERS, null], (v) => ({ label: `room ${json(v)}`, body: { room: v } })),
  ...each([0, 1], (v) => ({ label: `late_out ${v}`, body: { late_out: v } })),
  ...each([0, 9], (v) => ({ label: `child_count ${v}`, body: { child_count: v } })),
  ...each([0, 1, 9], (n) => ({
    label: `adult_count ${n}（age_groups も送る）`,
    body: { adult_count: n, age_groups: Array<string | null>(n).fill('30s') },
  })),
  ...each(ageOptions.map((o) => o.value || null), (v) => ({ label: `age_groups ${json(v)}`, body: { age_groups: [v, null] } })),
  ...each(groupOptions.map((o) => o.value || null), (v) => ({ label: `group_type ${json(v)}`, body: { group_type: v } })),
  ...each(purposeOptions.map((o) => o.value || null), (v) => ({ label: `purpose ${json(v)}`, body: { purpose: v } })),
  ...each(tourismOptions.map((o) => o.value || null), (v) => ({ label: `tourism_type ${json(v)}`, body: { tourism_type: v } })),
  ...each(['JP', 'TW', null], (v) => ({ label: `country ${json(v)}`, body: { country: v } })),
  // 自由入力（Route の上限ちょうど、空、記号・改行・絵文字）
  { label: 'guest_name 100 文字', body: { guest_name: 'あ'.repeat(100) } },
  { label: 'guest_name 空', body: { guest_name: '' } },
  { label: 'dinner_info / timetable_info', body: { dinner_info: ['アレルギー: 卵', ''], timetable_info: ['', '改行\nと "記号" 🍣'] } },
  { label: 'スタッフ名・都市・職業・備考', body: {
    check_in_staff_name: 'い'.repeat(100), a_tax_received_by_staff_name: 'う', city: 'Paris', profession: 'engineer', other_note: '長い備考'.repeat(50),
  } },
  { label: 'a_tax_received', body: { a_tax_received: true } },
  { label: 'mail_memo', body: { mail_memo: [{ month: '11', day: '1', name: 'x', summary: 'y', text: 'z', source: 'システム' }] } },
  // 泊数の変更（泊別配列も新しい泊数で送る）
  { label: 'check_out_date 3泊に延長', body: {
    check_out_date: addDays(CHECK_IN, 3),
    dinner_time: ['18:00', 'NONE', 'PENDING'], dinner_info: ['', '', ''], breakfast_time: ['8:00a', null, null],
    open_air_bath_time: [null, '20:00', null], timetable_info: ['a', 'b', 'c'],
  } },
  { label: 'check_out_date 1泊に短縮', body: {
    check_out_date: addDays(CHECK_IN, 1),
    dinner_time: ['CANCEL'], dinner_info: [''], breakfast_time: [null], open_air_bath_time: ['7:30'], timetable_info: [''],
  } },
]

describe('PATCH /api/reservations/[id] の往復', () => {
  it.each(patchCases.map((c) => [c.label, c] as const))('%s', async (_label, c) => {
    const id = await createDoc(baseDoc())
    const res = await patch(id, c.body)
    expect(res.status, await res.clone().text()).toBe(200)

    const read = await readBack(id)
    expect(read, '読み戻せない（スキップされた）').toBeDefined()
    expect(read).toMatchObject(c.expected ?? c.body)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })
})

// --- POST: 追加した予約は読み戻しても同じ ---

describe('POST /api/reservations の往復', () => {
  it.each(bookingSiteOptions.map((o) => o.value))('booking_site %s', async (site) => {
    const body = {
      check_in_date: CHECK_IN,
      check_out_date: CHECK_OUT,
      room: '61',
      adult_count: 3,
      child_count: 1,
      guest_name: `${RUN_ID} post ${site}`,
      booking_site: site,
      add_reason: '往復検査',
      staff_name: 'emulator',
    }
    const res = await POST(new Request('http://localhost/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=emulator-test' },
      body: JSON.stringify(body),
    }))
    expect(res.status, await res.clone().text()).toBe(201)
    const { reservation_number } = (await res.json()) as { reservation_number: string }

    const list = await firestoreReservationRepository.fetchByDateRange(CHECK_IN, CHECK_IN)
    const read = list.find((r) => r.reservation_number === reservation_number)
    expect(read, '追加した予約が読み戻せない').toBeDefined()
    createdIds.push(read!.id)
    expect(read).toMatchObject({
      check_in_date: CHECK_IN,
      check_out_date: CHECK_OUT,
      room: '61',
      adult_count: 3,
      child_count: 1,
      guest_name: body.guest_name,
      booking_site: site,
      cancel: 0,
    })
    expect(read!.dinner_time).toHaveLength(2)
    expect(read!.age_groups).toHaveLength(3)
    expect(read!.mail_memo).toHaveLength(1)
  })
})

// --- 壊れたドキュメントが他の予約を巻き込まない ---

describe('壊れたドキュメントの隔離', () => {
  const corrupted: Record<string, Record<string, unknown>> = {
    'C/O が C/I より前': { check_out_date: toFirestoreDate(addDays(CHECK_IN, -1)) },
    'C/O が C/I と同日': { check_out_date: toFirestoreDate(CHECK_IN) },
    '31 泊（上限超え）': { check_out_date: toFirestoreDate(addDays(CHECK_IN, 31)) },
    'adult_count が文字列': { adult_count: '2' },
    'adult_count が範囲外': { adult_count: 12 },
    'adult_count が NaN': { adult_count: Number.NaN },
    'check_out_date が YYYY-MM-DD': { check_out_date: CHECK_OUT },
    'check_out_date が欠損': { check_out_date: undefined },
    'room が定義外': { room: '99' },
    '泊別配列が配列でない': { dinner_time: '18:00', breakfast_time: { a: 1 } },
    '泊別配列の要素が範囲外': { dinner_time: ['25:00', 3], open_air_bath_time: ['6:00', true] },
    'mail_memo が壊れている': { mail_memo: 'x' },
  }

  it('すべての壊れ方を同じ日に入れても、正常な予約は取得でき、例外にならない', async () => {
    const validId = await createDoc(baseDoc())
    for (const override of Object.values(corrupted)) {
      const data = { ...baseDoc(), ...override }
      for (const [k, v] of Object.entries(data)) if (v === undefined) delete data[k]
      await createDoc(data)
    }

    vi.mocked(notifySlackFireAndForget).mockClear()
    const list = await firestoreReservationRepository.fetchByDateRange(CHECK_IN, CHECK_IN)
    expect(list.find((r) => r.id === validId)).toBeDefined()

    // BugHunting.md #10: 読み飛ばしはログ（WARN）だけで、Slack には通知しない
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()

    const [year, month] = CHECK_IN.split('-').map(Number)
    const monthly = await firestoreReservationRepository.fetchByMonth(year, month)
    expect(monthly.find((r) => r.id === validId)).toBeDefined()
  })

  it.each(Object.entries(corrupted))('%s: 取得は例外にならず、泊別配列は泊数と同じ長さ', async (_label, override) => {
    const data = { ...baseDoc(), ...override }
    for (const [k, v] of Object.entries(data)) if (v === undefined) delete data[k]
    const id = await createDoc(data)

    const list = await firestoreReservationRepository.fetchByDateRange(CHECK_IN, CHECK_IN)
    const read = list.find((r) => r.id === id)
    // 読めた場合（fallback で補完された場合）も、泊別配列の長さは泊数と一致する
    if (read) {
      const [ci, co] = [read.check_in_date, read.check_out_date].map((d) => Date.parse(d))
      const nights = (co - ci) / 86_400_000
      expect(read.dinner_time).toHaveLength(nights)
      expect(read.age_groups).toHaveLength(read.adult_count)
    }
  })
})
