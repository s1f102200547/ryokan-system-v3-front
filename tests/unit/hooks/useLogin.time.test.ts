import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useLogin } from '@/hooks/auth/useLogin'

// コードの段で 23:00 を過ぎたとき（docs/MfaBugHunt.md の S6）。サーバーは 403 outside_business_hours を返す
// （tests/time/mfaBoundaries.test.ts）。ログイン画面は fetchWithSession を使わないので、/time-restricted へは移らない

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })

describe('useLogin: コードの段で時間外になったとき', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    push.mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('「利用時間外です」を出し、確認中を解く。ダッシュボードへは移らない', async () => {
    fetchMock.mockResolvedValueOnce(json({ mfaRequired: true, phoneHint: '+81*******1234' }, 200))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login({ email: 'pc1@example.com', password: 'pw' }) })
    expect(result.current.step).toBe('code')

    fetchMock.mockResolvedValueOnce(json({ error: 'outside_business_hours' }, 403))
    let ok = true
    await act(async () => { ok = await result.current.verify('123456') })
    expect(ok).toBe(false)
    expect(result.current.error).toBe('利用時間外です（6:00〜23:00）')
    expect(result.current.isPending).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })
})
