import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import type { CleaningBoardData } from '@/types/cleaningBoard'
import { InfraError } from '@/types/errors'

vi.mock('@/application/cleaningBoard/getCleaningBoardUseCase')
import { getCleaningBoardUseCase } from '@/application/cleaningBoard/getCleaningBoardUseCase'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockUseCase = vi.mocked(getCleaningBoardUseCase)
const mockVerifySession = vi.mocked(verifySession)

function makeRequest(date?: string, withSession = true) {
  const url = date
    ? `http://localhost/api/cleaning-board?date=${date}`
    : `http://localhost/api/cleaning-board`
  return new Request(url, {
    method: 'GET',
    headers: withSession ? { cookie: 'session=valid-session-cookie' } : {}, // withSession = true（ログイン済み）
  })
}

const mockData: CleaningBoardData = {
  rows: [
    {
      room: '21',
      isTodayCheckIn: true,
      isFutureCheckIn: false,
      checkInReservation: { adult_count: 2, child_count: 1 },
      stayingReservation: null,
      isStayingContinued: false,
      isConsecutive: false,
      autoNotes: [],
    },
  ],
  unassignedReservations: [],
}

describe('GET /api/cleaning-board', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルト: 認証済みとして扱う
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
  })

  it('session Cookie がない場合 401 が返る', async () => {
    mockVerifySession.mockResolvedValue(null)

    const response = await GET(makeRequest('2026-04-01', false))

    expect(response.status).toBe(401)
  })

  it('session Cookie が無効な（ログイン中でない）場合 401 が返る', async () => {
    mockVerifySession.mockResolvedValue(null)

    const response = await GET(makeRequest('2026-04-01'))

    expect(response.status).toBe(401)
  })

  it('正常な date で 200 と CleaningBoardData が返る', async () => {
    mockUseCase.mockResolvedValue(mockData) // 0. usecaseを呼ぶ(返り値は強制的に決まってる)

    const response = await GET(makeRequest('2026-04-01')) // 1. 日付指定してapiを呼ぶ
    const body = await response.json() // 2. apiからの返り値を取得

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('rows')
    expect(body).toHaveProperty('unassignedReservations')
  })

  it('date パラメータなしで 400 が返る', async () => {
    const response = await GET(makeRequest())

    expect(response.status).toBe(400)
  })

  it('date 形式が不正（YYYY/MM/DD）で 400 が返る', async () => {
    const response = await GET(makeRequest('2026/04/01'))

    expect(response.status).toBe(400)
  })

  it('FIRESTORE_UNAVAILABLE の場合 503 が返る', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore down'))

    const response = await GET(makeRequest('2026-04-01'))

    expect(response.status).toBe(503)
  })

  it('FIRESTORE_DATA_CORRUPTION の場合 500 が返る', async () => {
    mockUseCase.mockRejectedValue(new InfraError('FIRESTORE_DATA_CORRUPTION', 'Schema error'))

    const response = await GET(makeRequest('2026-04-01'))

    expect(response.status).toBe(500)
  })

  it('想定外のエラーの場合 500 が返る', async () => {
    mockUseCase.mockRejectedValue(new Error('unexpected'))

    const response = await GET(makeRequest('2026-04-01'))

    expect(response.status).toBe(500)
  })

  it('isStayingContinued と isConsecutive が rows に含まれて返る', async () => {
    const data: CleaningBoardData = {
      rows: [
        {
          room: '21',
          isTodayCheckIn: false,
          isFutureCheckIn: false,
          checkInReservation: null,
          stayingReservation: { adult_count: 2, child_count: 0 },
          isStayingContinued: true,
          isConsecutive: true,
          autoNotes: [],
        },
      ],
      unassignedReservations: [],
    }
    mockUseCase.mockResolvedValue(data)

    const response = await GET(makeRequest('2026-04-01'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rows[0].isStayingContinued).toBe(true)
    expect(body.rows[0].isConsecutive).toBe(true)
  })

  it('autoNotes が rows に含まれて返る', async () => {
    const data: CleaningBoardData = {
      rows: [
        {
          room: '21',
          isTodayCheckIn: false,
          isFutureCheckIn: false,
          checkInReservation: null,
          stayingReservation: null,
          isStayingContinued: false,
          isConsecutive: false,
          autoNotes: ['21: レイトアウト11:00', '21: 前日空室のためセットアップ済み'],
        },
      ],
      unassignedReservations: [],
    }
    mockUseCase.mockResolvedValue(data)

    const response = await GET(makeRequest('2026-04-01'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.rows[0].autoNotes).toEqual(['21: レイトアウト11:00', '21: 前日空室のためセットアップ済み'])
  })
})
