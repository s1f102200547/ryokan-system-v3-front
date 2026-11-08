import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { useDailyTodos } from '@/hooks/daily/useDailyTodos'
import { controlledFetch } from '@tests/utils/controlledFetch'

vi.mock('@/hooks/auth/fetchWithSession', () => ({ fetchWithSession: vi.fn() }))

// 日次 todo（Domain.md の dailyInfo.todos）。画面に出す todo は、いつも今選んでいる日のもの

const isGet = (date: string) => (r: { url: string; method: string }) =>
  r.method === 'GET' && r.url === `/api/daily/${date}/todos`
const isPatch = (date: string) => (r: { url: string; method: string }) =>
  r.method === 'PATCH' && r.url === `/api/daily/${date}/todos`

describe('useDailyTodos', () => {
  let net: ReturnType<typeof controlledFetch>
  beforeEach(() => {
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })

  it('取得が終わるまで loading、終われば その日の todo を出す', async () => {
    const { result } = renderHook(() => useDailyTodos('2026-04-12'))
    expect(result.current.isLoading).toBe(true)
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [{ id: 'a', text: '買い出し' }] })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.todos).toEqual([{ id: 'a', text: '買い出し' }])
  })

  it('日付を切り替えたあとに前の日の取得が返っても、前の日の todo を出さない', async () => {
    const { result, rerender } = renderHook(({ date }) => useDailyTodos(date), { initialProps: { date: '2026-04-12' } })
    rerender({ date: '2026-04-13' })
    await net.last(isGet('2026-04-13')).resolve(200, { todos: [{ id: 'b', text: '13日の todo' }] })
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [{ id: 'a', text: '12日の todo' }] })
    expect(result.current.todos).toEqual([{ id: 'b', text: '13日の todo' }])
  })

  it('追加は、今の一覧に足した全件を保存し、成功したら一覧に出す', async () => {
    const { result } = renderHook(() => useDailyTodos('2026-04-12'))
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [{ id: 'a', text: '既存' }] })
    let done: Promise<void> | undefined
    act(() => { done = result.current.addTodo('新規') })
    expect(result.current.isSaving).toBe(true)
    const patch = net.last(isPatch('2026-04-12'))
    expect(patch.body).toEqual({ todos: [{ id: 'a', text: '既存' }, { id: expect.any(String), text: '新規' }] })
    await patch.resolve(200)
    await act(async () => { await done })
    expect(result.current.isSaving).toBe(false)
    expect(result.current.todos.map((t) => t.text)).toEqual(['既存', '新規'])
  })

  it('保存に失敗したら一覧は変えず、エラーを出す', async () => {
    const { result } = renderHook(() => useDailyTodos('2026-04-12'))
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [] })
    let done: Promise<void> | undefined
    act(() => { done = result.current.addTodo('新規') })
    await net.last(isPatch('2026-04-12')).resolve(500)
    await act(async () => { await done })
    expect(result.current.todos).toEqual([])
    expect(result.current.saveError).toBe('保存に失敗しました')
  })

  it('保存中に日付を切り替えても、前の日の保存の結果を今の日の一覧に入れない', async () => {
    const { result, rerender } = renderHook(({ date }) => useDailyTodos(date), { initialProps: { date: '2026-04-12' } })
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [{ id: 'a', text: '12日の todo' }] })
    let done: Promise<void> | undefined
    act(() => { done = result.current.addTodo('12日に追加') })

    rerender({ date: '2026-04-13' })
    await net.last(isGet('2026-04-13')).resolve(200, { todos: [{ id: 'b', text: '13日の todo' }] })
    // 12日の保存があとから終わる
    await net.last(isPatch('2026-04-12')).resolve(200)
    await act(async () => { await done })

    expect(result.current.todos).toEqual([{ id: 'b', text: '13日の todo' }])
  })

  it('保存中に日付を切り替えたあと今の日に追加しても、前の日の todo を今の日に保存しない', async () => {
    const { result, rerender } = renderHook(({ date }) => useDailyTodos(date), { initialProps: { date: '2026-04-12' } })
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [{ id: 'a', text: '12日の todo' }] })
    let done: Promise<void> | undefined
    act(() => { done = result.current.addTodo('12日に追加') })
    rerender({ date: '2026-04-13' })
    await net.last(isGet('2026-04-13')).resolve(200, { todos: [{ id: 'b', text: '13日の todo' }] })
    await net.last(isPatch('2026-04-12')).resolve(200)
    await act(async () => { await done })

    act(() => { void result.current.addTodo('13日に追加') })
    const texts = (net.last(isPatch('2026-04-13')).body as { todos: { text: string }[] }).todos.map((t) => t.text)
    expect(texts).toEqual(['13日の todo', '13日に追加'])
  })

  it('保存中に日付を切り替えたら、前の日の保存の失敗を今の日のエラーとして出さない', async () => {
    const { result, rerender } = renderHook(({ date }) => useDailyTodos(date), { initialProps: { date: '2026-04-12' } })
    await net.last(isGet('2026-04-12')).resolve(200, { todos: [] })
    let done: Promise<void> | undefined
    act(() => { done = result.current.addTodo('12日に追加') })
    rerender({ date: '2026-04-13' })
    await net.last(isGet('2026-04-13')).resolve(200, { todos: [] })
    // 12日の保存が失敗しても、13日の画面に「保存に失敗しました」を出さない（13日は何も保存していない）
    await net.last(isPatch('2026-04-12')).resolve(500)
    await act(async () => { await done })
    expect(result.current.saveError).toBeNull()
  })
})
