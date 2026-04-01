import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import type { CleaningBoardData } from '@/types/cleaningBoard'

vi.mock('@/application/cleaningBoard/getCleaningBoardUseCase')
import { getCleaningBoardUseCase } from '@/application/cleaningBoard/getCleaningBoardUseCase'

const mockUseCase = vi.mocked(getCleaningBoardUseCase) // 自分で好きな結果を返せるようにする

function makeRequest(date?: string) {
  const url = date
    ? `http://localhost/api/cleaning-board?date=${date}`
    : `http://localhost/api/cleaning-board`
  return new Request(url, { method: 'GET' })
}

const mockData: CleaningBoardData = {
  rows: [
    {
      room: '21',
      isTodayCheckIn: true,
      isFutureCheckIn: false,
      checkInReservation: { adult_count: 2, child_count: 1 },
    },
  ],
  unassignedReservations: [],
}

describe('GET /api/cleaning-board', () => {
  beforeEach(() => vi.clearAllMocks())

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

  it('UseCase が例外を投げた場合に 500 が返る', async () => {
    mockUseCase.mockRejectedValue(new Error('Firestore error'))

    const response = await GET(makeRequest('2026-04-01'))

    expect(response.status).toBe(500)
  })
})
