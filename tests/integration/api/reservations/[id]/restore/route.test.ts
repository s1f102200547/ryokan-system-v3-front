import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '@/app/api/reservations/[id]/restore/route'
import { InfraError } from '@/types/errors'
import { setupFakeToday } from '@tests/utils/routeTestHelper'

vi.mock('@/application/guestInfo/restoreReservationCommand')
import { restoreReservationCommand } from '@/application/guestInfo/restoreReservationCommand'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const mockCommand = vi.mocked(restoreReservationCommand)
const mockVerifySession = vi.mocked(verifySession)

const validBody = {
  staff_name: 'スタッフA',
  target_date: '2026-04-01',
  reason: '誤キャンセルのため復活',
}

function makeRequest(body: unknown = validBody, withSession = true) {
  return new Request('http://localhost/api/reservations/doc1/restore', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'doc1' })

// FIXED_TODAY = 2026-05-20
setupFakeToday()

describe('PATCH /api/reservations/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await PATCH(makeRequest(validBody, false), { params })
    expect(res.status).toBe(401)
  })

  it('reasonが空で400', async () => {
    const res = await PATCH(makeRequest({ ...validBody, reason: '' }), { params })
    expect(res.status).toBe(400)
  })

  // BugHunting.md #7: target_date も実在日と範囲を見る
  it.each([
    ['実在しない日', '2026-02-30'],
    ['範囲外の過去', '2025-01-01'],
  ])('target_date が%sで400', async (_label, date) => {
    const res = await PATCH(makeRequest({ ...validBody, target_date: date }), { params })
    expect(res.status).toBe(400)
    expect(mockCommand).not.toHaveBeenCalled()
  })

  it('正常リクエストで200', async () => {
    mockCommand.mockResolvedValue(undefined)
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(200)
  })

  it('InfraErrorで503', async () => {
    mockCommand.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(503)
  })

  // BugHunting.md #5: [id] を検証しておらず、Firestore が投げる例外が 503 + ALERT になっていた
  describe('[id] の検証', () => {
    it.each([
      ['空', ''],
      ['スラッシュを含む（%2F は Next.js がデコードして渡す）', 'a/b'],
      ['.', '.'],
      ['..', '..'],
      ['予約名（__x__）', '__x__'],
      ['1500 バイト超', 'あ'.repeat(501)],
    ])('%s で400', async (_label, id) => {
      const res = await PATCH(makeRequest(validBody), { params: Promise.resolve({ id }) })
      expect(res.status).toBe(400)
      expect(mockCommand).not.toHaveBeenCalled()
    })
  })

  it('存在しない予約（FIRESTORE_NOT_FOUND）は404で、Slack に通知しない', async () => {
    vi.mocked(mockCommand).mockRejectedValue(new InfraError('FIRESTORE_NOT_FOUND', 'not found'))
    const res = await PATCH(makeRequest(validBody), { params })
    expect(res.status).toBe(404)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })
})
