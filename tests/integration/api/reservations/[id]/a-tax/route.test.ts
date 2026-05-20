import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '@/app/api/reservations/[id]/a-tax/route'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/reservation/firestoreReservationRepository')
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockRepo = vi.mocked(firestoreReservationRepository)
const mockVerifySession = vi.mocked(verifySession)

const params = Promise.resolve({ id: 'doc1' })

function makeRequest(body: unknown, withSession = true) {
  return new Request('http://localhost/api/reservations/doc1/a-tax', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/reservations/[id]/a-tax', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
    mockRepo.updateATax = vi.fn().mockResolvedValue(undefined)
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ a_tax_received: true }, false), { params })
    expect(res.status).toBe(401)
  })

  it('空ボディで400', async () => {
    const res = await PATCH(makeRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('checkboxのみ更新で200', async () => {
    const res = await PATCH(makeRequest({ a_tax_received: true }), { params })
    expect(res.status).toBe(200)
    expect(mockRepo.updateATax).toHaveBeenCalledWith('doc1', { a_tax_received: true })
  })

  it('徴収スタッフ名のみ更新で200', async () => {
    const res = await PATCH(makeRequest({ a_tax_received_by_staff_name: 'スタッフA' }), { params })
    expect(res.status).toBe(200)
    expect(mockRepo.updateATax).toHaveBeenCalledWith('doc1', { a_tax_received_by_staff_name: 'スタッフA' })
  })

  it('2フィールド同時更新で200', async () => {
    const body = { a_tax_received: true, a_tax_received_by_staff_name: 'スタッフA' }
    const res = await PATCH(makeRequest(body), { params })
    expect(res.status).toBe(200)
    expect(mockRepo.updateATax).toHaveBeenCalledWith('doc1', body)
  })

  it('InfraErrorで503', async () => {
    mockRepo.updateATax = vi.fn().mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await PATCH(makeRequest({ a_tax_received: false }), { params })
    expect(res.status).toBe(503)
  })
})
