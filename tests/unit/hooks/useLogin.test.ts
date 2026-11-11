import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useLogin } from '@/hooks/auth/useLogin'

// ログイン（AGENTS.md・Domain.md）:
// メールアドレスとパスワードを /api/auth/login に送る（パスワードの確認と Session Cookie の発行はサーバー）→ ダッシュボードへ。
// ブラウザから Firebase は呼ばない。
// 成功したら移り終わるまで「ログイン中」のまま（押し直させない）。失敗したら理由を出し、押せる状態に戻す

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

const credentials = { email: 'pc1@example.com', password: 'pw' }

describe('useLogin', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    push.mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function loginWith(response: Response) {
    fetchMock.mockResolvedValue(response)
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    return result
  }

  it('メールアドレスとパスワードだけを送り、成功したらダッシュボードへ直接移る。移り終わるまで isPending のまま', async () => {
    const result = await loginWith(new Response('{}', { status: 200 }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'pc1@example.com', password: 'pw' }),
    }))
    expect(push).toHaveBeenCalledWith('/daily-dashboard')
    expect(result.current.isPending).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it.each([
    [401, { error: 'invalid_credentials' }, 'メールアドレスまたはパスワードが正しくありません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 60 }, 'ログインの失敗が続いたため、1分後までログインできません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 61 }, 'ログインの失敗が続いたため、2分後までログインできません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 3600 }, 'ログインの失敗が続いたため、60分後までログインできません'],
    [429, 'not json', 'ログインの失敗が続いたため、しばらくログインできません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 'x' }, 'ログインの失敗が続いたため、しばらくログインできません'],
    [403, { error: 'client_not_allowed' }, 'この PC・ブラウザからはログインできません。'],
    [403, { error: 'outside_business_hours' }, '利用時間外です（6:00〜23:00）'],
    [403, 'not json', '利用時間外です（6:00〜23:00）'],
    [500, {}, 'サービスが一時的に利用できません。しばらくお待ちください'],
    [503, {}, 'サービスが一時的に利用できません。しばらくお待ちください'],
  ])('%i（%j）は理由を出し、押せる状態に戻す（移らない）', async (status, body, message) => {
    const result = await loginWith(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
    expect(result.current.error).toBe(message)
    expect(result.current.isPending).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  // 同じ回線で同時に試行中（attempt_in_progress）なら、少し待って自動で送り直す（押し直させない）
  describe('同時の試行の自動の送り直し', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })
    const busy = (retryAfterSeconds: unknown = 1) =>
      new Response(JSON.stringify({ error: 'attempt_in_progress', retryAfterSeconds }), { status: 429 })

    async function run() {
      const { result } = renderHook(() => useLogin())
      let done = false
      act(() => { void result.current.login(credentials).then(() => { done = true }) })
      for (let i = 0; i < 20 && !done; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      return result
    }

    it('少し待って送り直し、通ればダッシュボードへ。その間はログイン中のまま', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      const { result } = renderHook(() => useLogin())
      act(() => { void result.current.login(credentials) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.current.isPending).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(push).toHaveBeenCalledWith('/daily-dashboard')
    })

    it('送り直した結果がパスワードの誤りなら、その理由を出す', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 }))
      const result = await run()
      expect(result.current.error).toBe('メールアドレスまたはパスワードが正しくありません')
    })

    it('5回送り直しても混んでいれば、混み合っていると出して押せる状態に戻す（無限に送らない）', async () => {
      fetchMock.mockImplementation(async () => busy())
      const result = await run()
      expect(fetchMock).toHaveBeenCalledTimes(6)
      expect(result.current.error).toBe('混み合っています。しばらくしてからもう一度お試しください')
      expect(result.current.isPending).toBe(false)
    })

    it('待つ時間はサーバーの指定に従うが、3秒より長くは待たない', async () => {
      fetchMock.mockResolvedValueOnce(busy(600)).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      const { result } = renderHook(() => useLogin())
      act(() => { void result.current.login(credentials) })
      await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(1) })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('止められている（too_many_attempts）ときは送り直さない', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'too_many_attempts', retryAfterSeconds: 60 }), { status: 429 }))
      const result = await run()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.current.error).toBe('ログインの失敗が続いたため、1分後までログインできません')
    })
  })

  it('通信エラーは理由を出し、押せる状態に戻す', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(result.current.error).toBe('通信エラーが発生しました。ネットワーク接続を確認してください')
    expect(result.current.isPending).toBe(false)
  })
})
