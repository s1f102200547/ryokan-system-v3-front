import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/reservation/firestoreReservationRepository')
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockRepo = vi.mocked(firestoreReservationRepository)
const mockVerifySession = vi.mocked(verifySession)

const validBody = { received: true, staffName: 'スタッフA' }

function makeRequest(body: unknown = validBody, withSession = true) {
  return new Request('http://localhost/api/reservations/doc1/a-tax', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'doc1' })

describe('PATCH /api/reservations/[id]/a-tax', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await PATCH(makeRequest(validBody, false), { params })
    expect(res.status).toBe(401)
  })

  it('receivedがbooleanでなければ400', async () => {
    const res = await PATCH(makeRequest({ received: 'yes', staffName: 'A' }), { params })
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200', async () => {
    mockRepo.updateATaxReceived = vi.fn().mockResolvedValue(undefined)
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(200)
    expect(mockRepo.updateATaxReceived).toHaveBeenCalledWith('doc1', true, 'スタッフA')
  })

  it('InfraErrorで503', async () => {
    mockRepo.updateATaxReceived = vi.fn().mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(503)
  })
})
