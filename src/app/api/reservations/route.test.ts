import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { InfraError } from '@/types/errors'

vi.mock('@/application/guestInfo/addReservationCommand')
import { addReservationCommand } from '@/application/guestInfo/addReservationCommand'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockCommand = vi.mocked(addReservationCommand)
const mockVerifySession = vi.mocked(verifySession)

const validBody = {
  check_in_date: '2026-04-01',
  check_out_date: '2026-04-03',
  room: '21',
  adult_count: 2,
  child_count: 0,
  guest_name: 'テストゲスト',
  booking_site: 'booking.com',
  add_reason: '電話予約',
  staff_name: '田中',
}

function makeRequest(body: unknown = validBody, withSession = true) {
  return new Request('http://localhost/api/reservations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await POST(makeRequest(validBody, false))
    expect(res.status).toBe(401)
  })

  it('不正なbodyで400', async () => {
    const res = await POST(makeRequest({ check_in_date: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('check_out_date <= check_in_date で400', async () => {
    const res = await POST(makeRequest({ ...validBody, check_out_date: '2026-04-01' }))
    expect(res.status).toBe(400)
  })

  it('正常リクエストで201とreservation_numberを返す', async () => {
    mockCommand.mockResolvedValue('test-uuid')
    const res = await POST(makeRequest())
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('reservation_number', 'test-uuid')
  })

  it('InfraErrorで503', async () => {
    mockCommand.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })
})
