import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { GET } from './route'
import { InfraError } from '@/types/errors'

vi.mock('@/application/guestInfo/getGuestInfoUseCase')
import { getGuestInfoUseCase } from '@/application/guestInfo/getGuestInfoUseCase'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockUseCase = vi.mocked(getGuestInfoUseCase)
const mockVerifySession = vi.mocked(verifySession)

const FIXED_TODAY = '2026-05-20'
const FIXED_NOW_UTC = new Date('2026-05-20T01:00:00.000Z')

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW_UTC)
})
afterAll(() => {
  vi.useRealTimers()
})

function makeRequest(date?: string, withSession = true) {
  const url = date
    ? `http://localhost/api/guest-info?date=${date}`
    : `http://localhost/api/guest-info`
  return new Request(url, {
    headers: withSession ? { cookie: 'session=valid' } : {},
  })
}

const mockData = { normal: [], staying: [], cancelled: [] }

describe('GET /api/guest-info', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await GET(makeRequest(FIXED_TODAY, false))
    expect(res.status).toBe(401)
  })

  it('dateパラメータなしで400', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
  })

  it('不正なdate形式で400', async () => {
    const res = await GET(makeRequest('2026/04/01'))
    expect(res.status).toBe(400)
  })

  it('存在しない日付（2026-02-30）で400', async () => {
    const res = await GET(makeRequest('2026-02-30'))
    expect(res.status).toBe(400)
  })

  it('範囲外の日付（過去: 2000-01-01）で400', async () => {
    const res = await GET(makeRequest('2000-01-01'))
    expect(res.status).toBe(400)
  })

  it('範囲外の日付（未来: 2099-12-31）で400', async () => {
    const res = await GET(makeRequest('2099-12-31'))
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200とGuestInfoDataを返す', async () => {
    mockUseCase.mockResolvedValue(mockData)
    const res = await GET(makeRequest(FIXED_TODAY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('normal')
    expect(body).toHaveProperty('staying')
    expect(body).toHaveProperty('cancelled')
  })

  it('InfraErrorで503', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await GET(makeRequest(FIXED_TODAY))
    expect(res.status).toBe(503)
  })

  it('想定外エラーで500', async () => {
    mockUseCase.mockRejectedValue(new Error('unexpected'))
    const res = await GET(makeRequest(FIXED_TODAY))
    expect(res.status).toBe(500)
  })
})
