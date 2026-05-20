import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '@/app/api/reservations/[id]/cancel/route'
import { InfraError } from '@/types/errors'

vi.mock('@/application/guestInfo/cancelReservationCommand')
import { cancelReservationCommand } from '@/application/guestInfo/cancelReservationCommand'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockCommand = vi.mocked(cancelReservationCommand)
const mockVerifySession = vi.mocked(verifySession)

const validBody = {
  staff_name: 'スタッフA',
  target_date: '2026-04-01',
  reason: 'テストキャンセル',
}

function makeRequest(body: unknown = validBody, withSession = true) {
  return new Request('http://localhost/api/reservations/doc1/cancel', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'doc1' })

describe('PATCH /api/reservations/[id]/cancel', () => {
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
})
