import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import type { TimetableData } from '@/types/timetable'
import { InfraError } from '@/types/errors'

vi.mock('@/application/timetable/getTimetableUseCase')
import { getTimetableUseCase } from '@/application/timetable/getTimetableUseCase'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockUseCase = vi.mocked(getTimetableUseCase)
const mockVerifySession = vi.mocked(verifySession)

function makeRequest(date?: string, withSession = true) {
  const url = date
    ? `http://localhost/api/timetable?date=${date}`
    : `http://localhost/api/timetable`
  return new Request(url, {
    method: 'GET',
    headers: withSession ? { cookie: 'session=valid-session-cookie' } : {},
  })
}

const mockData: TimetableData = {
  checkInSlots: { '15:00': ['㉑田中太郎-2'] },
  stayingGuestLabels: ['㉑-2(1/2泊目)'],
  eveningBathSlots: { '16:00': ['㉑'] },
  dinnerSlots: { '17:30': ['㉑田中太郎-2'] },
  guestInfoRows: { '21': 'memo', '22': '空室', '31': '空室', '32': '空室', '42': '空室', '43': '空室', '61': '空室' },
  breakfastSlots: { '8:00a': ['㉑'] },
  checkoutRooms: [],
  morningBathSlots: {},
  lateCheckoutRooms: [],
}

describe('GET /api/timetable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  // ── 認証 ────────────────────────────────────────────────────────────────

  it('session Cookie がない場合 401 が返る', async () => {
    mockVerifySession.mockResolvedValue(null)

    const response = await GET(makeRequest('2026-04-12', false))

    expect(response.status).toBe(401)
  })

  it('session Cookie が無効な場合 401 が返る', async () => {
    mockVerifySession.mockResolvedValue(null)

    const response = await GET(makeRequest('2026-04-12'))

    expect(response.status).toBe(401)
  })

  // ── クエリパラメータ検証 ────────────────────────────────────────────────

  it('date パラメータなしで 400 が返る', async () => {
    const response = await GET(makeRequest())

    expect(response.status).toBe(400)
  })

  it('date 形式が不正（YYYY/MM/DD）で 400 が返る', async () => {
    const response = await GET(makeRequest('2026/04/12'))

    expect(response.status).toBe(400)
  })

  // ── 正常系 ──────────────────────────────────────────────────────────────

  it('正常な date で 200 と TimetableData が返る', async () => {
    mockUseCase.mockResolvedValue(mockData)

    const response = await GET(makeRequest('2026-04-12'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('checkInSlots')
    expect(body).toHaveProperty('stayingGuestLabels')
    expect(body).toHaveProperty('eveningBathSlots')
    expect(body).toHaveProperty('dinnerSlots')
    expect(body).toHaveProperty('guestInfoRows')
    expect(body).toHaveProperty('breakfastSlots')
    expect(body).toHaveProperty('checkoutRooms')
    expect(body).toHaveProperty('morningBathSlots')
    expect(body).toHaveProperty('lateCheckoutRooms')
  })

  it('checkInSlots・stayingGuestLabels の内容がそのまま返る', async () => {
    mockUseCase.mockResolvedValue(mockData)

    const response = await GET(makeRequest('2026-04-12'))
    const body = await response.json()

    expect(body.checkInSlots['15:00']).toEqual(['㉑田中太郎-2'])
    expect(body.stayingGuestLabels).toEqual(['㉑-2(1/2泊目)'])
  })

  it('checkoutRooms・lateCheckoutRooms の内容がそのまま返る', async () => {
    const data: TimetableData = {
      ...mockData,
      checkoutRooms: ['㉑'],
      lateCheckoutRooms: ['㉑'],
    }
    mockUseCase.mockResolvedValue(data)

    const response = await GET(makeRequest('2026-04-13'))
    const body = await response.json()

    expect(body.checkoutRooms).toEqual(['㉑'])
    expect(body.lateCheckoutRooms).toEqual(['㉑'])
  })

  // ── InfraError ──────────────────────────────────────────────────────────

  it('FIRESTORE_UNAVAILABLE の場合 503 が返る', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore down'))

    const response = await GET(makeRequest('2026-04-12'))

    expect(response.status).toBe(503)
  })

  it('FIRESTORE_DATA_CORRUPTION の場合 500 が返る', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_DATA_CORRUPTION', 'Schema error'))

    const response = await GET(makeRequest('2026-04-12'))

    expect(response.status).toBe(500)
  })

  it('FIRESTORE_PERMISSION の場合 500 が返る', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_PERMISSION', 'Permission denied'))

    const response = await GET(makeRequest('2026-04-12'))

    expect(response.status).toBe(500)
  })

  it('想定外のエラーの場合 500 が返る', async () => {
    mockUseCase.mockRejectedValue(new Error('unexpected'))

    const response = await GET(makeRequest('2026-04-12'))

    expect(response.status).toBe(500)
  })
})
