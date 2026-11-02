// 入力の検証に失敗したときの 400（T7-5）: production では Zod の詳細（details）を返さず、ログにだけ場所と種類を残す
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupFakeToday } from '@tests/utils/routeTestHelper'

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }))
vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: {}, adminDb: {} }))
vi.mock('@/application/aTaxTable/getATaxTableUseCase', () => ({ getATaxTableUseCase: vi.fn() }))
vi.mock('@/application/guestInfo/addReservationCommand', () => ({ addReservationCommand: vi.fn() }))
vi.mock('@/application/guestInfo/cancelReservationCommand', () => ({ cancelReservationCommand: vi.fn() }))
vi.mock('@/application/guestInfo/restoreReservationCommand', () => ({ restoreReservationCommand: vi.fn() }))
vi.mock('@/application/guestInfo/updateReservationCommand', () => ({ updateReservationCommand: vi.fn() }))
vi.mock('@/infra/reservation/firestoreReservationRepository', () => ({ firestoreReservationRepository: {} }))
vi.mock('@/infra/daily/firestoreDailyRepository', () => ({ firestoreDailyRepository: {} }))

import { verifySession } from '@/lib/auth/verifySession'
import { logger } from '@/lib/logger'
import * as aTaxTable from '@/app/api/a-tax-table/route'
import * as safeBalanceChecker from '@/app/api/daily/[date]/safe-balance-checker/route'
import * as todos from '@/app/api/daily/[date]/todos/route'
import * as aTax from '@/app/api/reservations/[id]/a-tax/route'
import * as cancel from '@/app/api/reservations/[id]/cancel/route'
import * as restore from '@/app/api/reservations/[id]/restore/route'
import * as reservation from '@/app/api/reservations/[id]/route'
import * as reservations from '@/app/api/reservations/route'

setupFakeToday()

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>
const asHandler = (f: unknown) => f as Handler

// 個人情報に見立てた値。レスポンスにもログにも出てはいけない
const SECRET = '秘密の名前'

// [Route, handler, method, params, 検証に失敗する入力]
const CASES: [string, Handler, string, Record<string, string>, { body?: unknown; query?: string }][] = [
  ['PATCH reservations/[id]', asHandler(reservation.PATCH), 'PATCH', { id: 'doc1' }, { body: { guest_name: SECRET.repeat(100) } }],
  ['POST reservations', asHandler(reservations.POST), 'POST', {}, { body: { guest_name: SECRET } }],
  ['PATCH [id]/cancel', asHandler(cancel.PATCH), 'PATCH', { id: 'doc1' }, { body: { staff_name: SECRET } }],
  ['PATCH [id]/restore', asHandler(restore.PATCH), 'PATCH', { id: 'doc1' }, { body: { staff_name: SECRET } }],
  ['PATCH [id]/a-tax', asHandler(aTax.PATCH), 'PATCH', { id: 'doc1' }, { body: { a_tax_received: SECRET } }],
  ['GET a-tax-table', asHandler(aTaxTable.GET), 'GET', {}, { query: `year=${encodeURIComponent(SECRET)}&month=5` }],
  ['PATCH daily/[date]/todos', asHandler(todos.PATCH), 'PATCH', { date: '2026-05-20' }, { body: { todos: SECRET } }],
  ['PATCH daily/[date]/safe-balance-checker', asHandler(safeBalanceChecker.PATCH), 'PATCH', { date: '2026-05-20' },
    { body: { staffName: 1, secret: SECRET } }],
]

function call(handler: Handler, method: string, params: Record<string, string>, input: { body?: unknown; query?: string }) {
  const url = `http://localhost/api/x${input.query ? `?${input.query}` : ''}`
  const request = new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', cookie: 'session=valid' },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
  return handler(request, { params: Promise.resolve(params) })
}

describe('入力の検証に失敗したときの 400（T7-5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(verifySession).mockResolvedValue({ uid: 'user-1' } as Awaited<ReturnType<typeof verifySession>>)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
    })

    it.each(CASES)('%s: error だけを返し、details を返さない', async (_label, handler, method, params, input) => {
      const res = await call(handler, method, params, input)
      expect(res.status).toBe(400)
      const json = await res.json() as Record<string, unknown>
      expect(Object.keys(json)).toEqual(['error'])
    })

    it.each(CASES)('%s: ログには場所と種類だけを残し、入力の値を出さない', async (_label, handler, method, params, input) => {
      await call(handler, method, params, input)
      expect(logger.warn).toHaveBeenCalledTimes(1)
      const [message, extra] = vi.mocked(logger.warn).mock.calls[0]
      expect(message).toContain('入力の検証に失敗')
      const issues = (extra as { issues: Record<string, unknown>[] }).issues
      expect(issues.length).toBeGreaterThan(0)
      for (const issue of issues) expect(Object.keys(issue).sort()).toEqual(['code', 'path'])
      expect(JSON.stringify(extra)).not.toContain(SECRET)
    })
  })

  describe('development / test', () => {
    it.each(CASES)('%s: 原因が分かるよう details を返す', async (_label, handler, method, params, input) => {
      const res = await call(handler, method, params, input)
      expect(res.status).toBe(400)
      const json = await res.json() as Record<string, unknown>
      expect(json).toHaveProperty('details')
    })
  })
})
