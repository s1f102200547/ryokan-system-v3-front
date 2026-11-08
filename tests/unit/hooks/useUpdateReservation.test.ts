import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { useUpdateReservation } from '@/hooks/guestInfo/useUpdateReservation'
import type { SaveResult } from '@/hooks/guestInfo/useUpdateReservation'
import { controlledFetch } from '@tests/utils/controlledFetch'

vi.mock('@/hooks/auth/fetchWithSession', () => ({ fetchWithSession: vi.fn() }))

// 予約の保存（編集モーダルの自動保存が使う）。
// 結果: saved / retry（通信エラー・5xx。送り直せば通る見込み）/ rejected（4xx。送り直しても通らない）

describe('useUpdateReservation', () => {
  let net: ReturnType<typeof controlledFetch>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // 保存を始めて、結果の Promise を返す（ここでは待たない。応答はテストが net で返す）
  function run(result: { current: ReturnType<typeof useUpdateReservation> }, patch: object): { done: Promise<SaveResult> } {
    let done!: Promise<SaveResult>
    act(() => { done = result.current.execute('rsv-1', patch) })
    return { done }
  }

  it('PATCH で送り、保存中 → 保存済み → 2秒後に表示を消す', async () => {
    const { result } = renderHook(() => useUpdateReservation())
    const { done: p } = run(result, { guest_name: '山田' })
    expect(result.current.saveStatus).toBe('saving')
    const req = net.last()
    expect(req).toMatchObject({ url: '/api/reservations/rsv-1', method: 'PATCH', body: { guest_name: '山田' } })
    await req.resolve(200)
    await expect(p).resolves.toBe('saved')
    expect(result.current.saveStatus).toBe('saved')
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(result.current.saveStatus).toBe('idle')
  })

  it.each([
    [500, 'retry', '保存に失敗しました。管理者に通知済みです。'],
    [503, 'retry', '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'],
    [400, 'rejected', '入力内容に誤りがあるため保存できませんでした。画面を再読み込みして入力し直してください。'],
    [404, 'rejected', '対象の予約が見つかりません。画面を再読み込みしてください。'],
  ] as const)('%i は %s、メッセージを出す', async (status, expected, message) => {
    const { result } = renderHook(() => useUpdateReservation())
    const { done: p } = run(result, { guest_name: '山田' })
    await net.last().resolve(status)
    await expect(p).resolves.toBe(expected)
    expect(result.current.saveStatus).toBe('error')
    expect(result.current.error).toBe(message)
  })

  it('通信エラーは retry', async () => {
    const { result } = renderHook(() => useUpdateReservation())
    const { done: p } = run(result, { guest_name: '山田' })
    await net.last().fail()
    await expect(p).resolves.toBe('retry')
    expect(result.current.saveStatus).toBe('error')
    expect(result.current.error).toBe('通信エラーが発生しました。ネットワーク接続を確認してください')
  })

  it('clearError でエラーを消し、表示を戻す', async () => {
    const { result } = renderHook(() => useUpdateReservation())
    const { done: p } = run(result, { guest_name: '山田' })
    await net.last().resolve(500)
    await p
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
    expect(result.current.saveStatus).toBe('idle')
  })

  it('保存済みの直後に次の保存を始めたら、前の「2秒後に消す」で保存中の表示を消さない', async () => {
    const { result } = renderHook(() => useUpdateReservation())
    const { done: p1 } = run(result, { guest_name: '山田' })
    await net.last().resolve(200)
    await p1
    await act(async () => { vi.advanceTimersByTime(1500) })
    run(result, { guest_name: '山田太郎' })
    expect(result.current.saveStatus).toBe('saving')
    // 1回目の保存から 2 秒たった。2回目はまだ返っていない
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(result.current.saveStatus).toBe('saving')
  })

  it('保存済みの直後に次の保存が失敗したら、前の「2秒後に消す」でエラーの表示を消さない', async () => {
    const { result } = renderHook(() => useUpdateReservation())
    const { done: p1 } = run(result, { guest_name: '山田' })
    await net.last().resolve(200)
    await p1
    await act(async () => { vi.advanceTimersByTime(1500) })
    const { done: p2 } = run(result, { guest_name: '山田太郎' })
    await net.last().resolve(500)
    await p2
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(result.current.saveStatus).toBe('error')
  })
})
