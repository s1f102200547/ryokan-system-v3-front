import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/daily/firestoreDailyRepository')
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockRepo = vi.mocked(firestoreDailyRepository)
const mockVerifySession = vi.mocked(verifySession)

const validBody = { staffName: '締めスタッフA' }
const params = Promise.resolve({ date: '2026-05-06' })

function makeRequest(body: unknown = validBody, withSession = true) {
  return new Request('http://localhost/api/daily/2026-05-06/safe-balance-checker', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/daily/[date]/safe-balance-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
    mockRepo.updateSafeBalanceChecker = vi.fn().mockResolvedValue(undefined)
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await PATCH(makeRequest(validBody, false), { params })
    expect(res.status).toBe(401)
  })

  it('staffNameが空文字で400', async () => {
    const res = await PATCH(makeRequest({ staffName: '' }), { params })
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200', async () => {
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(200)
    expect(mockRepo.updateSafeBalanceChecker).toHaveBeenCalledWith('2026-05-06', '締めスタッフA')
  })

  it('InfraErrorで503', async () => {
    mockRepo.updateSafeBalanceChecker = vi.fn().mockRejectedValue(
      new InfraError('FIRESTORE_UNAVAILABLE', 'down'),
    )
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(503)
  })
})
