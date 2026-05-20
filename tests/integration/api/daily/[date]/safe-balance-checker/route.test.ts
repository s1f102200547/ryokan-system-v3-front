import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FIXED_TODAY, setupFakeToday } from '@tests/utils/routeTestHelper'
import { GET, PATCH } from '@/app/api/daily/[date]/safe-balance-checker/route'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/daily/firestoreDailyRepository')
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockRepo = vi.mocked(firestoreDailyRepository)
const mockVerifySession = vi.mocked(verifySession)

setupFakeToday()

const validBody = { staffName: '締めスタッフA' }
const params = Promise.resolve({ date: FIXED_TODAY })

function makeGetRequest(withSession = true) {
  return new Request(`http://localhost/api/daily/${FIXED_TODAY}/safe-balance-checker`, {
    method: 'GET',
    headers: withSession ? { cookie: 'session=valid' } : {},
  })
}

function makeRequest(body: unknown = validBody, withSession = true) {
  return new Request(`http://localhost/api/daily/${FIXED_TODAY}/safe-balance-checker`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('GET /api/daily/[date]/safe-balance-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
    mockRepo.fetchSafeBalanceCheckers = vi.fn().mockResolvedValue({})
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await GET(makeGetRequest(false), { params })
    expect(res.status).toBe(401)
  })

  it('存在しない日付（2026-02-30）で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2026-02-30' }) })
    expect(res.status).toBe(400)
  })

  it('範囲外の日付（過去: 2000-01-01）で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2000-01-01' }) })
    expect(res.status).toBe(400)
  })

  it('範囲外の日付（未来: 2099-12-31）で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2099-12-31' }) })
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200とstaffNameを返す', async () => {
    mockRepo.fetchSafeBalanceCheckers = vi.fn().mockResolvedValue({ [FIXED_TODAY]: '田中' })
    const res = await GET(makeGetRequest(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.staffName).toBe('田中')
  })
})

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

  it('存在しない日付（2026-02-30）で400', async () => {
    const res = await PATCH(makeRequest(), { params: Promise.resolve({ date: '2026-02-30' }) })
    expect(res.status).toBe(400)
  })

  it('範囲外の日付（過去: 2000-01-01）で400', async () => {
    const res = await PATCH(makeRequest(), { params: Promise.resolve({ date: '2000-01-01' }) })
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200', async () => {
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(200)
    expect(mockRepo.updateSafeBalanceChecker).toHaveBeenCalledWith(FIXED_TODAY, '締めスタッフA')
  })

  it('InfraErrorで503', async () => {
    mockRepo.updateSafeBalanceChecker = vi.fn().mockRejectedValue(
      new InfraError('FIRESTORE_UNAVAILABLE', 'down'),
    )
    const res = await PATCH(makeRequest(), { params })
    expect(res.status).toBe(503)
  })
})
