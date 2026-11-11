import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useLogin } from '@/hooks/auth/useLogin'

// ログイン（AGENTS.md・Domain.md）:
// 1. Firebase Auth で認証して idToken を得る 2. /api/auth/login に送り Session Cookie を受け取る 3. ダッシュボードへ
// 成功したら移り終わるまで「ログイン中」のまま（押し直させない）。失敗したら理由を出し、押せる状態に戻す

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: vi.fn() }))
vi.mock('@/lib/firebase/client', () => ({ getFirebaseAuth: () => ({}) }))

const credentials = { email: 'pc1@example.com', password: 'pw' }

describe('useLogin', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    push.mockReset()
    vi.mocked(signInWithEmailAndPassword).mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function signInSucceeds() {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue({
      user: { getIdToken: async () => 'id-token' },
    } as unknown as Awaited<ReturnType<typeof signInWithEmailAndPassword>>)
  }

  it('成功したら idToken を送り、ダッシュボードへ直接移る。移り終わるまで isPending のまま', async () => {
    signInSucceeds()
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ idToken: 'id-token' }) }))
    expect(push).toHaveBeenCalledWith('/daily-dashboard')
    expect(result.current.isPending).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('メールアドレス・パスワードの誤りは、その旨を出して押せる状態に戻す', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue({ code: 'auth/invalid-credential' })
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(result.current.error).toBe('メールアドレスまたはパスワードが正しくありません')
    expect(result.current.isPending).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it.each([
    [403, '利用時間外です（6:00〜23:00）'],
    [500, 'サービスが一時的に利用できません。しばらくお待ちください'],
    [503, 'サービスが一時的に利用できません。しばらくお待ちください'],
  ])('サーバーが %i なら理由を出し、押せる状態に戻す（移らない）', async (status, message) => {
    signInSucceeds()
    fetchMock.mockResolvedValue(new Response('{}', { status }))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(result.current.error).toBe(message)
    expect(result.current.isPending).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it.each([
    [{ error: 'client_not_allowed' }, 'この PC・ブラウザからはログインできません。'],
    [{ error: 'outside_business_hours' }, '利用時間外です（6:00〜23:00）'],
    ['not json', '利用時間外です（6:00〜23:00）'],
  ])('403 は本文の error で出し分ける: %j', async (body, message) => {
    signInSucceeds()
    fetchMock.mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 403 }))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(result.current.error).toBe(message)
    expect(result.current.isPending).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it('通信エラーは理由を出し、押せる状態に戻す', async () => {
    signInSucceeds()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(result.current.error).toBe('通信エラーが発生しました。ネットワーク接続を確認してください')
    expect(result.current.isPending).toBe(false)
  })
})
