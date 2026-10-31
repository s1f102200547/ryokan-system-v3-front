// 全 Route Handler のファジング（BugHunting.md §3.3、mock 版）
// Application / Infra を mock し、入力検証を網羅する。判定: 入力が原因で 5xx を返さない・Slack に通知しない。
// Firestore のエラー分類まで含めた確認は Emulator 版（tests/emulator/routes.fuzz.test.ts）で行う
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupFakeToday, FIXED_TODAY } from '@tests/utils/routeTestHelper'
import { RAW_BODIES, FIELD_VALUES, ID_VALUES, DATE_VALUES, NUMBER_QUERY_VALUES } from '@tests/utils/fuzzInputs'

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }))
vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn(), createSessionCookie: vi.fn() },
  adminDb: {},
}))
vi.mock('@/application/aTaxTable/getATaxTableUseCase', () => ({ getATaxTableUseCase: vi.fn() }))
vi.mock('@/application/cleaningBoard/getCleaningBoardUseCase', () => ({ getCleaningBoardUseCase: vi.fn() }))
vi.mock('@/application/guestInfo/getGuestInfoUseCase', () => ({ getGuestInfoUseCase: vi.fn() }))
vi.mock('@/application/timetable/getTimetableUseCase', () => ({ getTimetableUseCase: vi.fn() }))
vi.mock('@/application/guestInfo/addReservationCommand', () => ({ addReservationCommand: vi.fn() }))
vi.mock('@/application/guestInfo/cancelReservationCommand', () => ({ cancelReservationCommand: vi.fn() }))
vi.mock('@/application/guestInfo/restoreReservationCommand', () => ({ restoreReservationCommand: vi.fn() }))
vi.mock('@/application/guestInfo/updateReservationCommand', () => ({ updateReservationCommand: vi.fn() }))
vi.mock('@/infra/reservation/firestoreReservationRepository', () => ({
  firestoreReservationRepository: { updateATax: vi.fn() },
}))
vi.mock('@/infra/daily/firestoreDailyRepository', () => ({
  firestoreDailyRepository: {
    fetchDailyTodos: vi.fn(), updateDailyTodos: vi.fn(),
    fetchSafeBalanceCheckers: vi.fn(), updateSafeBalanceChecker: vi.fn(),
  },
}))

import { verifySession } from '@/lib/auth/verifySession'
import { notifySlackFireAndForget } from '@/lib/slack'
import { adminAuth } from '@/lib/firebase/admin'
import { getATaxTableUseCase } from '@/application/aTaxTable/getATaxTableUseCase'
import { getCleaningBoardUseCase } from '@/application/cleaningBoard/getCleaningBoardUseCase'
import { getGuestInfoUseCase } from '@/application/guestInfo/getGuestInfoUseCase'
import { getTimetableUseCase } from '@/application/timetable/getTimetableUseCase'
import { addReservationCommand } from '@/application/guestInfo/addReservationCommand'
import { cancelReservationCommand } from '@/application/guestInfo/cancelReservationCommand'
import { restoreReservationCommand } from '@/application/guestInfo/restoreReservationCommand'
import { updateReservationCommand } from '@/application/guestInfo/updateReservationCommand'
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'

import * as aTaxTable from '@/app/api/a-tax-table/route'
import * as login from '@/app/api/auth/login/route'
import * as cleaningBoard from '@/app/api/cleaning-board/route'
import * as safeBalanceChecker from '@/app/api/daily/[date]/safe-balance-checker/route'
import * as todos from '@/app/api/daily/[date]/todos/route'
import * as guestInfo from '@/app/api/guest-info/route'
import * as aTax from '@/app/api/reservations/[id]/a-tax/route'
import * as cancel from '@/app/api/reservations/[id]/cancel/route'
import * as restore from '@/app/api/reservations/[id]/restore/route'
import * as reservation from '@/app/api/reservations/[id]/route'
import * as reservations from '@/app/api/reservations/route'
import * as timetable from '@/app/api/timetable/route'

// FIXED_TODAY = 2026-05-20（日付の範囲チェックの基準）
setupFakeToday()

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>
type RouteCase = {
  route: string                      // src/app/api/ からのパス（[id] などそのまま）
  method: 'GET' | 'POST' | 'PATCH'
  handler: Handler
  param?: { key: 'id' | 'date'; valid: string }
  query?: Record<string, { valid: string; kind: 'date' | 'number' }>
  body?: Record<string, unknown>
}

const asHandler = (f: unknown) => f as Handler
const staffBody = { staff_name: 'スタッフ', target_date: FIXED_TODAY, reason: '理由' }

const ROUTES: RouteCase[] = [
  { route: 'a-tax-table', method: 'GET', handler: asHandler(aTaxTable.GET),
    query: { year: { valid: '2026', kind: 'number' }, month: { valid: '5', kind: 'number' } } },
  { route: 'auth/login', method: 'POST', handler: asHandler(login.POST), body: { idToken: 'token' } },
  { route: 'cleaning-board', method: 'GET', handler: asHandler(cleaningBoard.GET),
    query: { date: { valid: FIXED_TODAY, kind: 'date' } } },
  { route: 'daily/[date]/safe-balance-checker', method: 'GET', handler: asHandler(safeBalanceChecker.GET),
    param: { key: 'date', valid: FIXED_TODAY } },
  { route: 'daily/[date]/safe-balance-checker', method: 'PATCH', handler: asHandler(safeBalanceChecker.PATCH),
    param: { key: 'date', valid: FIXED_TODAY }, body: { staffName: 'スタッフ' } },
  { route: 'daily/[date]/todos', method: 'GET', handler: asHandler(todos.GET),
    param: { key: 'date', valid: FIXED_TODAY } },
  { route: 'daily/[date]/todos', method: 'PATCH', handler: asHandler(todos.PATCH),
    param: { key: 'date', valid: FIXED_TODAY }, body: { todos: [{ id: 't1', text: '花束' }] } },
  { route: 'guest-info', method: 'GET', handler: asHandler(guestInfo.GET),
    query: { date: { valid: FIXED_TODAY, kind: 'date' } } },
  { route: 'reservations/[id]/a-tax', method: 'PATCH', handler: asHandler(aTax.PATCH),
    param: { key: 'id', valid: 'doc1' }, body: { a_tax_received: true, a_tax_received_by_staff_name: 'スタッフ' } },
  { route: 'reservations/[id]/cancel', method: 'PATCH', handler: asHandler(cancel.PATCH),
    param: { key: 'id', valid: 'doc1' }, body: staffBody },
  { route: 'reservations/[id]/restore', method: 'PATCH', handler: asHandler(restore.PATCH),
    param: { key: 'id', valid: 'doc1' }, body: staffBody },
  { route: 'reservations/[id]', method: 'PATCH', handler: asHandler(reservation.PATCH),
    param: { key: 'id', valid: 'doc1' },
    body: {
      guest_name: 'x', check_out_date: '2026-05-22', arrival_time: '15:00',
      dinner_time: ['NONE', '18:00'], age_groups: ['20s', null],
      mail_memo: [{ month: '5', day: '20', name: 'x', summary: 'x', text: 'x', source: 'システム' }],
    } },
  { route: 'reservations', method: 'POST', handler: asHandler(reservations.POST),
    body: {
      check_in_date: FIXED_TODAY, check_out_date: '2026-05-21', room: '21', adult_count: 2, child_count: 0,
      guest_name: 'x', booking_site: 'chillnn', add_reason: 'x', staff_name: 'x',
    } },
  { route: 'timetable', method: 'GET', handler: asHandler(timetable.GET),
    query: { date: { valid: FIXED_TODAY, kind: 'date' } } },
]

// --- 入力の組み立て ---

type Input = { label: string; param?: string; query?: Record<string, string | undefined>; rawBody?: string }

function validInput(r: RouteCase): Input {
  return {
    label: '正しい入力',
    param: r.param?.valid,
    query: r.query && Object.fromEntries(Object.entries(r.query).map(([k, q]) => [k, q.valid])),
    rawBody: r.body && JSON.stringify(r.body),
  }
}

function fuzzInputs(r: RouteCase): Input[] {
  const valid = validInput(r)
  const inputs: Input[] = []
  if (r.body) {
    for (const [label, raw] of RAW_BODIES) inputs.push({ ...valid, label: `body: ${label}`, rawBody: raw })
    for (const key of Object.keys(r.body)) {
      const omitted = Object.fromEntries(Object.entries(r.body).filter(([k]) => k !== key))
      inputs.push({ ...valid, label: `body.${key}: 欠損`, rawBody: JSON.stringify(omitted) })
      for (const [label, value] of FIELD_VALUES) {
        inputs.push({ ...valid, label: `body.${key}: ${label}`, rawBody: JSON.stringify({ ...r.body, [key]: value }) })
        // 配列のフィールドは要素も壊す
        if (Array.isArray(r.body[key])) {
          inputs.push({ ...valid, label: `body.${key}[0]: ${label}`, rawBody: JSON.stringify({ ...r.body, [key]: [value] }) })
        }
      }
    }
  }
  if (r.param) {
    const values = r.param.key === 'id' ? ID_VALUES : DATE_VALUES
    for (const [label, value] of values) inputs.push({ ...valid, label: `[${r.param.key}]: ${label}`, param: value })
  }
  if (r.query) {
    for (const [key, q] of Object.entries(r.query)) {
      inputs.push({ ...valid, label: `?${key}: 欠損`, query: { ...valid.query, [key]: undefined } })
      const values = q.kind === 'date' ? DATE_VALUES : NUMBER_QUERY_VALUES
      for (const [label, value] of values) {
        inputs.push({ ...valid, label: `?${key}: ${label}`, query: { ...valid.query, [key]: value } })
      }
    }
  }
  return inputs
}

async function send(r: RouteCase, input: Input): Promise<Response> {
  const url = new URL(`http://localhost/api/${r.route}`)
  for (const [k, v] of Object.entries(input.query ?? {})) if (v !== undefined) url.searchParams.set(k, v)
  const request = new Request(url, {
    method: r.method,
    headers: { 'Content-Type': 'application/json', cookie: 'session=valid' },
    body: r.method === 'GET' ? undefined : (input.rawBody ?? ''),
  })
  const params = r.param ? { [r.param.key]: input.param ?? '' } : {}
  return r.handler(request, { params: Promise.resolve(params) })
}

// --- mock の戻り値（正しい入力では 2xx になる値） ---

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifySession).mockResolvedValue({ uid: 'user-1' })
  // 本物の firebase-admin は、でたらめなトークンに auth/argument-error を返す
  vi.mocked(adminAuth.verifyIdToken).mockRejectedValue({
    code: 'auth/argument-error', message: 'Decoding Firebase ID token failed.',
  })
  vi.mocked(adminAuth.createSessionCookie).mockResolvedValue('session-cookie')
  vi.mocked(getATaxTableUseCase).mockResolvedValue({ rows: [], safeBalanceCheckers: {} })
  vi.mocked(getCleaningBoardUseCase).mockResolvedValue({ rows: [], unassignedReservations: [] })
  vi.mocked(getGuestInfoUseCase).mockResolvedValue({ normal: [], staying: [], cancelled: [] })
  vi.mocked(getTimetableUseCase).mockResolvedValue({} as Awaited<ReturnType<typeof getTimetableUseCase>>)
  vi.mocked(addReservationCommand).mockResolvedValue('uuid')
  vi.mocked(cancelReservationCommand).mockResolvedValue(undefined)
  vi.mocked(restoreReservationCommand).mockResolvedValue(undefined)
  vi.mocked(updateReservationCommand).mockResolvedValue({ success: true, value: undefined })
  vi.mocked(firestoreReservationRepository.updateATax).mockResolvedValue(undefined)
  vi.mocked(firestoreDailyRepository.fetchDailyTodos).mockResolvedValue([])
  vi.mocked(firestoreDailyRepository.updateDailyTodos).mockResolvedValue(undefined)
  vi.mocked(firestoreDailyRepository.fetchSafeBalanceCheckers).mockResolvedValue({})
  vi.mocked(firestoreDailyRepository.updateSafeBalanceChecker).mockResolvedValue(undefined)
})

// --- テスト ---

describe('Route の漏れがない', () => {
  it('src/app/api/ のすべての Route とメソッドがファジングの対象に入っている', async () => {
    const modules = import.meta.glob('/src/app/api/**/route.ts')
    const exported: string[] = []
    for (const [file, load] of Object.entries(modules)) {
      const mod = (await load()) as Record<string, unknown>
      const route = file.replace('/src/app/api/', '').replace('/route.ts', '')
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof mod[method] === 'function') exported.push(`${method} ${route}`)
      }
    }
    expect(ROUTES.map((r) => `${r.method} ${r.route}`).sort()).toEqual(exported.sort())
  })
})

describe.each(ROUTES.map((r) => [`${r.method} /api/${r.route}`, r] as const))('%s', (_name, r) => {
  it('正しい入力は 2xx（mock が正しく効いている）', async () => {
    const res = await send(r, validInput(r))
    // ログインは mock の verifyIdToken が常に「不正なトークン」を返すので 401
    expect(res.status, await res.clone().text()).toBe(r.route === 'auth/login' ? 401 : r.method === 'POST' ? 201 : 200)
  })

  it.each(fuzzInputs(r).map((input) => [input.label, input] as const))('%s', async (_label, input) => {
    const res = await send(r, input)
    expect(res.status, await res.clone().text()).toBeLessThan(500)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })
})
