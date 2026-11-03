// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { setNowJST, JST_BOUNDARY_TIMES } from '@tests/utils/timeHelper'

vi.mock('@/infra/reservation/firestoreReservationRepository', () => ({
  firestoreReservationRepository: { addReservation: vi.fn().mockResolvedValue('uuid') },
}))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { addReservationCommand } from '@/application/guestInfo/addReservationCommand'

// 操作履歴（mail_memo）の月日がサーバーのローカル時刻（Cloud Run は UTC）だった。
// JST 0:00〜9:00 の手動追加が前日の日付になる
describe.each(JST_BOUNDARY_TIMES)('手動追加の操作履歴の月日 JST 2026-06-01 %s', (time) => {
  afterEach(() => vi.useRealTimers())

  it('JST の今日（6/1）になる', async () => {
    vi.useFakeTimers()
    setNowJST(`2026-06-01T${time}`)
    await addReservationCommand({
      check_in_date: '2026-06-01', check_out_date: '2026-06-02', room: '21', adult_count: 2, child_count: 0,
      guest_name: 'x', booking_site: 'chillnn', add_reason: 'x', staff_name: 'x',
    })
    const memo = vi.mocked(firestoreReservationRepository.addReservation).mock.calls.at(-1)?.[1]
    expect({ month: memo?.month, day: memo?.day }).toEqual({ month: '6', day: '1' })
  })
})
