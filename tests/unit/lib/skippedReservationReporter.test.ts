import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { reportSkippedReservations } from '@/lib/skippedReservationReporter'

const doc = (id: string) => ({ id, reason: `broken ${id}` })

// BugHunting.md #10: 壊れた予約は画面から黙って消えていた（console.error だけ）
describe('reportSkippedReservations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('読み飛ばしがなければ何もしない', () => {
    reportSkippedReservations([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('取得ごとに件数・ID・理由を WARN で出す', () => {
    reportSkippedReservations([doc('a'), doc('b')])
    reportSkippedReservations([doc('a')])
    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(vi.mocked(logger.warn).mock.calls[0][1]).toEqual({
      count: 2, ids: ['a', 'b'], reasons: ['broken a', 'broken b'],
    })
  })

  it('Slack には通知しない（データの異常は障害ではない）', () => {
    reportSkippedReservations([doc('a')])
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })
})
