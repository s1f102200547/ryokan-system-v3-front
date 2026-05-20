import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '@/app/api/reservations/[id]/route'
import { InfraError } from '@/types/errors'

vi.mock('@/application/guestInfo/updateReservationCommand')
import { updateReservationCommand } from '@/application/guestInfo/updateReservationCommand'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockCommand = vi.mocked(updateReservationCommand)
const mockVerifySession = vi.mocked(verifySession)

function makeRequest(body: unknown = { guest_name: 'テスト' }, withSession = true) {
  return new Request('http://localhost/api/reservations/doc1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'doc1' })

describe('PATCH /api/reservations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await PATCH(makeRequest({}, false), { params })
    expect(res.status).toBe(401)
  })

  it('空オブジェクトで400（patchが空）', async () => {
    const res = await PATCH(makeRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200', async () => {
    mockCommand.mockResolvedValue(undefined)
    const res = await PATCH(makeRequest({ guest_name: 'テスト' }), { params })
    expect(res.status).toBe(200)
  })

  it('InfraErrorで503', async () => {
    mockCommand.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await PATCH(makeRequest({ guest_name: 'テスト' }), { params })
    expect(res.status).toBe(503)
  })
})
