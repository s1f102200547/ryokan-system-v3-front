// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/infra/reservation/firestoreReservationRepository', () => ({
  firestoreReservationRepository: { fetchByDateRange: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/infra/daily/firestoreDailyRepository', () => ({
  firestoreDailyRepository: { fetchDailyTodos: vi.fn().mockResolvedValue([]) },
}))
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { getGuestInfoUseCase } from '@/application/guestInfo/getGuestInfoUseCase'
import { getCleaningBoardUseCase } from '@/application/cleaningBoard/getCleaningBoardUseCase'
import { getTimetableUseCase } from '@/application/timetable/getTimetableUseCase'

const lastRange = () => vi.mocked(firestoreReservationRepository.fetchByDateRange).mock.calls.at(-1)

// 取得窓（前後 30 日）の日付が TZ でずれないか。月末・年末・夏時間の切り替え日を含む
describe.each([
  // 対象日, 30 日前, 30 日後
  ['2026-03-08', '2026-02-06', '2026-04-07'],
  ['2026-03-31', '2026-03-01', '2026-04-30'],
  ['2026-11-01', '2026-10-02', '2026-12-01'],
  ['2026-12-31', '2026-12-01', '2027-01-30'],
])('対象日 %s', (date, before30, after30) => {
  it('ゲスト情報は 30 日前〜対象日', async () => {
    await getGuestInfoUseCase(date)
    expect(lastRange()).toEqual([before30, date])
  })

  it('清掃ボード・タイムテーブルは前後 30 日', async () => {
    await getCleaningBoardUseCase(date)
    expect(lastRange()).toEqual([before30, after30])
    await getTimetableUseCase(date)
    expect(lastRange()).toEqual([before30, after30])
  })
})
