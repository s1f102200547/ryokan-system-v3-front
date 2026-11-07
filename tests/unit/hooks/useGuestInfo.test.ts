import { renderHook } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { useGuestInfo } from '@/hooks/guestInfo/useGuestInfo'
import { controlledFetch } from '@tests/utils/controlledFetch'

vi.mock('@/hooks/auth/fetchWithSession', () => ({ fetchWithSession: vi.fn() }))

// 予約カードのデータ（GET /api/guest-info?date=）。
// 画面に出してよいのは、今の日付・今の refreshKey で取ったデータだけ（前の日のデータ、古い取得の結果を出さない）

const body = (name: string) => ({ normal: [{ id: name, guest_name: name }], staying: [], cancelled: [], roomConflicts: [] })
const forDate = (date: string) => (r: { url: string }) => r.url === `/api/guest-info?date=${date}`

type Props = { date: string; refreshKey: number }

describe('useGuestInfo', () => {
  let net: ReturnType<typeof controlledFetch>
  beforeEach(() => {
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })

  function setup(initial: Props = { date: '2026-04-12', refreshKey: 0 }) {
    return renderHook(({ date, refreshKey }: Props) => useGuestInfo(date, refreshKey), { initialProps: initial })
  }

  it('取得が終わるまで loading、終われば その日のデータを返す', async () => {
    const { result } = setup()
    expect(result.current.isLoading).toBe(true)
    await net.last(forDate('2026-04-12')).resolve(200, body('12日'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadedDate).toBe('2026-04-12')
    expect(result.current.data?.normal[0].guest_name).toBe('12日')
  })

  it('日付を切り替えたら、新しい日の取得が終わるまで loading', async () => {
    const { result, rerender } = setup()
    await net.last(forDate('2026-04-12')).resolve(200, body('12日'))
    rerender({ date: '2026-04-13', refreshKey: 0 })
    expect(result.current.isLoading).toBe(true)
    await net.last(forDate('2026-04-13')).resolve(200, body('13日'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.loadedDate).toBe('2026-04-13')
    expect(result.current.data?.normal[0].guest_name).toBe('13日')
  })

  it('前の日の取得があとから返っても、今の日のデータを上書きしない', async () => {
    const { result, rerender } = setup()
    rerender({ date: '2026-04-13', refreshKey: 0 })
    await net.last(forDate('2026-04-13')).resolve(200, body('13日'))
    await net.last(forDate('2026-04-12')).resolve(200, body('12日'))
    expect(result.current.loadedDate).toBe('2026-04-13')
    expect(result.current.data?.normal[0].guest_name).toBe('13日')
  })

  it('連打して日付が進んでも、最後の日のデータだけを出す', async () => {
    const { result, rerender } = setup()
    rerender({ date: '2026-04-13', refreshKey: 0 })
    rerender({ date: '2026-04-14', refreshKey: 0 })
    // 返る順序を入れ替える
    await net.last(forDate('2026-04-14')).resolve(200, body('14日'))
    await net.last(forDate('2026-04-13')).resolve(200, body('13日'))
    await net.last(forDate('2026-04-12')).resolve(200, body('12日'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data?.normal[0].guest_name).toBe('14日')
  })

  it('取り直し（refreshKey）では同じ日をもう一度取り、古い取得の結果で上書きしない', async () => {
    const { result, rerender } = setup()
    await net.last(forDate('2026-04-12')).resolve(200, body('1回目'))
    rerender({ date: '2026-04-12', refreshKey: 1 })
    const second = net.last(forDate('2026-04-12'))
    rerender({ date: '2026-04-12', refreshKey: 2 })
    const third = net.last(forDate('2026-04-12'))
    expect(second).not.toBe(third)
    await third.resolve(200, body('3回目'))
    await second.resolve(200, body('2回目'))
    expect(result.current.data?.normal[0].guest_name).toBe('3回目')
  })

  it('日付を切り替えた直後は、前の日のデータを返さない', async () => {
    const { result, rerender } = setup()
    await net.last(forDate('2026-04-12')).resolve(200, body('12日'))
    rerender({ date: '2026-04-13', refreshKey: 0 })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('同じ日の取り直し中は、前のデータを返したまま isRefreshing。届いたら入れ替える', async () => {
    const { result, rerender } = setup()
    await net.last(forDate('2026-04-12')).resolve(200, body('1回目'))
    expect(result.current.isRefreshing).toBe(false)
    rerender({ date: '2026-04-12', refreshKey: 1 })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.data?.normal[0].guest_name).toBe('1回目')
    await net.last(forDate('2026-04-12')).resolve(200, body('2回目'))
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.data?.normal[0].guest_name).toBe('2回目')
  })

  it('A → B → A と戻ったら、戻った A は取り直しが終わるまで isRefreshing（前の A を最新として扱わない）', async () => {
    const { result, rerender } = setup()
    await net.last(forDate('2026-04-12')).resolve(200, body('12日 古い'))
    rerender({ date: '2026-04-13', refreshKey: 0 })
    rerender({ date: '2026-04-12', refreshKey: 0 })
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.isLoading).toBe(false)
    const requests = net.requests.filter(forDate('2026-04-12'))
    expect(requests).toHaveLength(2)
    await requests[1].resolve(200, body('12日 新しい'))
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.data?.normal[0].guest_name).toBe('12日 新しい')
  })

  it('前のエラーは、取り直しの間は返さない', async () => {
    const { result, rerender } = setup()
    await net.last().resolve(500)
    rerender({ date: '2026-04-12', refreshKey: 1 })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it.each([
    [400, 'この日付は表示できません。日付を選び直してください。'],
    [500, 'データの取得に失敗しました。管理者に通知済みです。'],
    [503, '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'],
  ])('%i はエラーにし、データを返さない', async (status, message) => {
    const { result } = setup()
    await net.last().resolve(status)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(message)
    expect(result.current.data).toBeNull()
  })

  it('通信エラーはエラーにする', async () => {
    const { result } = setup()
    await net.last().fail()
    expect(result.current.error).toBe('通信エラーが発生しました。ネットワーク接続を確認してください')
  })

  it('取り直しに失敗したら、前のデータを残さずエラーにする', async () => {
    const { result, rerender } = setup()
    await net.last().resolve(200, body('1回目'))
    rerender({ date: '2026-04-12', refreshKey: 1 })
    await net.last().resolve(500)
    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })
})
