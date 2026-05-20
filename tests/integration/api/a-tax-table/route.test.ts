import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/a-tax-table/route'
import { InfraError } from '@/types/errors'

vi.mock('@/application/aTaxTable/getATaxTableUseCase')
import { getATaxTableUseCase } from '@/application/aTaxTable/getATaxTableUseCase'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockUseCase = vi.mocked(getATaxTableUseCase)
const mockVerifySession = vi.mocked(verifySession)

function makeRequest(year?: string, month?: string, withSession = true) {
  const params = new URLSearchParams()
  if (year) params.set('year', year)
  if (month) params.set('month', month)
  return new Request(`http://localhost/api/a-tax-table?${params}`, {
    headers: withSession ? { cookie: 'session=valid' } : {},
  })
}

describe('GET /api/a-tax-table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await GET(makeRequest('2026', '4', false))
    expect(res.status).toBe(401)
  })

  it('yearなしで400', async () => {
    const res = await GET(makeRequest(undefined, '4'))
    expect(res.status).toBe(400)
  })

  it('month範囲外で400', async () => {
    const res = await GET(makeRequest('2026', '13'))
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200とrowsを返す', async () => {
    mockUseCase.mockResolvedValue({ rows: [], safeBalanceCheckers: {} })
    const res = await GET(makeRequest('2026', '4'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('rows')
  })

  it('InfraErrorで503', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await GET(makeRequest('2026', '4'))
    expect(res.status).toBe(503)
  })
})
