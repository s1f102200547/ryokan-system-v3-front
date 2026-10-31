// 全 Route Handler のファジング（BugHunting.md §3.3、Emulator 版）
// 実際の Firestore / Auth（Emulator）に向けて、エラーの分類まで確かめる（R5）。
// 判定: 入力が原因で 5xx を返さない・Slack に通知しない。存在しない ID は 404、不正な ID は 400
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { RAW_BODIES, FIELD_VALUES, ID_VALUES, DATE_VALUES } from '@tests/utils/fuzzInputs'
import { adminDb } from '@/lib/firebase/admin'
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { addDays, getTodayJST } from '@/lib/dateUtils'
import * as login from '@/app/api/auth/login/route'
import * as safeBalanceChecker from '@/app/api/daily/[date]/safe-balance-checker/route'
import * as todos from '@/app/api/daily/[date]/todos/route'
import * as aTax from '@/app/api/reservations/[id]/a-tax/route'
import * as cancel from '@/app/api/reservations/[id]/cancel/route'
import * as restore from '@/app/api/reservations/[id]/restore/route'
import * as reservation from '@/app/api/reservations/[id]/route'

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn().mockResolvedValue({ uid: 'emulator-test' }) }))
vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>

const RUN_ID = `emutest-fuzz-${Date.now()}`
const TODAY = getTodayJST()
const CHECK_IN = addDays(TODAY, 10)
const toFirestoreDate = (d: string) => d.replace(/-/g, '/')
const createdReservationIds: string[] = []

async function call(handler: unknown, path: string, method: string, params: Record<string, string>, rawBody?: string) {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: 'session=emulator-test' },
    body: method === 'GET' ? undefined : (rawBody ?? ''),
  })
  return (handler as Handler)(request, { params: Promise.resolve(params) })
}

async function createReservation(cancel: 0 | 1 = 0): Promise<string> {
  const id = `${RUN_ID}-${createdReservationIds.length}`
  createdReservationIds.push(id)
  await adminDb.collection('guestInfoV2').doc(id).set({
    check_in_date: toFirestoreDate(CHECK_IN),
    check_out_date: toFirestoreDate(addDays(CHECK_IN, 2)),
    adult_count: 2, child_count: 0, room: '21', cancel,
    dinner_time: ['NONE', 'NONE'], age_groups: [null, null],
  })
  return id
}

beforeAll(() => {
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  expect(process.env.FIREBASE_PROJECT_ID).toMatch(/^demo-/)
})

beforeEach(() => vi.mocked(notifySlackFireAndForget).mockClear())

afterAll(async () => {
  await Promise.all(createdReservationIds.map((id) => adminDb.collection('guestInfoV2').doc(id).delete()))
})

function expectNotServerError(res: Response) {
  expect(res.status).toBeLessThan(500)
  expect(notifySlackFireAndForget).not.toHaveBeenCalled()
}

// --- [id] を取る Route ---

const staffBody = JSON.stringify({ staff_name: 'スタッフ', target_date: TODAY, reason: '理由' })
const ID_ROUTES = [
  ['PATCH /api/reservations/[id]', reservation.PATCH, '', JSON.stringify({ guest_name: 'x' })],
  ['PATCH /api/reservations/[id]/cancel', cancel.PATCH, '/cancel', staffBody],
  ['PATCH /api/reservations/[id]/restore', restore.PATCH, '/restore', staffBody],
  ['PATCH /api/reservations/[id]/a-tax', aTax.PATCH, '/a-tax', JSON.stringify({ a_tax_received: true })],
] as const

describe.each(ID_ROUTES)('%s の [id]', (_name, handler, suffix, body) => {
  it('存在しない ID は 404（障害として通知しない）', async () => {
    const res = await call(handler, `/api/reservations/no-such-id${suffix}`, 'PATCH', { id: `${RUN_ID}-no-such-id` }, body)
    expect(res.status).toBe(404)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  it.each(ID_VALUES)('%s', async (_label, id, invalid) => {
    const res = await call(handler, `/api/reservations/x${suffix}`, 'PATCH', { id }, body)
    // ID の制約に反するものは入口で 400、ID として有効なものは「存在しない」の 404
    expect(res.status).toBe(invalid ? 400 : 404)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  it('存在する ID は 200（Emulator に正しく届いている）', async () => {
    // 復活はキャンセル済みの予約にだけできる（そうでなければ 409。BugHunting.md #27）
    const id = await createReservation(suffix === '/restore' ? 1 : 0)
    const res = await call(handler, `/api/reservations/${id}${suffix}`, 'PATCH', { id }, body)
    expect(res.status, await res.clone().text()).toBe(200)
  })
})

// --- 予約の更新 body ---

describe('PATCH /api/reservations/[id] の body', () => {
  const validBody = {
    guest_name: 'x', check_out_date: addDays(CHECK_IN, 2), arrival_time: '15:00',
    dinner_time: ['NONE', '18:00'], age_groups: ['20s', null],
  }
  const inputs: [string, string][] = [
    ...RAW_BODIES.map(([label, raw]) => [`body: ${label}`, raw] as [string, string]),
    ...Object.keys(validBody).flatMap((key) =>
      FIELD_VALUES.map(([label, value]) => [`body.${key}: ${label}`, JSON.stringify({ ...validBody, [key]: value })] as [string, string]),
    ),
  ]
  let id: string
  beforeAll(async () => { id = await createReservation() })

  it.each(inputs)('%s', async (_label, raw) => {
    const res = await call(reservation.PATCH, `/api/reservations/${id}`, 'PATCH', { id }, raw)
    expectNotServerError(res)
  })

  it('壊れた body をすべて送ったあとも、予約は読み戻せる（不正な値が書かれていない）', async () => {
    const list = await firestoreReservationRepository.fetchByDateRange(CHECK_IN, CHECK_IN)
    expect(list.find((r) => r.id === id)).toBeDefined()
  })
})

// --- 日次データの [date] ---

const DATE_ROUTES = [
  ['GET /api/daily/[date]/todos', todos.GET, 'todos', 'GET', undefined],
  ['PATCH /api/daily/[date]/todos', todos.PATCH, 'todos', 'PATCH', JSON.stringify({ todos: [] })],
  ['GET /api/daily/[date]/safe-balance-checker', safeBalanceChecker.GET, 'safe-balance-checker', 'GET', undefined],
  ['PATCH /api/daily/[date]/safe-balance-checker', safeBalanceChecker.PATCH, 'safe-balance-checker', 'PATCH',
    JSON.stringify({ staffName: 'x' })],
] as const

describe.each(DATE_ROUTES)('%s の [date]', (_name, handler, sub, method, body) => {
  it.each(DATE_VALUES)('%s', async (_label, date) => {
    const res = await call(handler, `/api/daily/x/${sub}`, method, { date }, body)
    expect(res.status).toBe(400)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })
})

// --- ログイン（実際の Auth Emulator の verifyIdToken） ---

describe('POST /api/auth/login', () => {
  const tokens: [string, unknown][] = [
    ...FIELD_VALUES.map(([label, value]) => [label, value] as [string, unknown]),
    ['JWT の形の文字列', 'a.b.c'],
    ['署名なしの JWT（別プロジェクト）',
      `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"aud":"other"}').toString('base64url')}.`],
  ]

  it.each(RAW_BODIES)('body: %s', async (_label, raw) => {
    expectNotServerError(await call(login.POST, '/api/auth/login', 'POST', {}, raw))
  })

  it.each(tokens)('idToken: %s', async (_label, idToken) => {
    expectNotServerError(await call(login.POST, '/api/auth/login', 'POST', {}, JSON.stringify({ idToken })))
  })
})
