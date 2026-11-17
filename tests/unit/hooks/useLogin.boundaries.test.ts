import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useLogin } from '@/hooks/auth/useLogin'
import { MFA_RESEND_COOLDOWN_MS } from '@/constants/auth'

// ログイン画面の hook の境界値（docs/MfaBugHunt.md の S5）。再送の待ち・止められている時間の終わり、
// サーバーの指定（retryAfterSeconds・phoneHint）が欠けた・おかしいとき。既存の useLogin.test.ts にない境目だけ

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

const credentials = { email: 'pc1@example.com', password: 'pw' }
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })
const mfaRequired = (phoneHint: unknown = '+81*******1234') => json({ mfaRequired: true, phoneHint }, 200)

describe('useLogin の境界値', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    push.mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  async function loginWith(response: Response) {
    fetchMock.mockResolvedValueOnce(response)
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    return result
  }

  describe('再送の待ち', () => {
    it(`${MFA_RESEND_COOLDOWN_MS - 1}ms では押せず（あと1秒）、${MFA_RESEND_COOLDOWN_MS}ms ちょうどで押せる`, async () => {
      const result = await loginWith(mfaRequired())
      fetchMock.mockClear()
      await advance(MFA_RESEND_COOLDOWN_MS - 1)
      expect(result.current.resendWaitSeconds).toBe(1)
      await act(async () => { await result.current.resend() })
      expect(fetchMock).not.toHaveBeenCalled()

      await advance(1)
      expect(result.current.resendWaitSeconds).toBe(0)
      fetchMock.mockResolvedValueOnce(mfaRequired())
      await act(async () => { await result.current.resend() })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('止められている時間', () => {
    it('60秒の指定: 59.999秒では止まったまま、60秒ちょうどで戻る', async () => {
      const result = await loginWith(json({ error: 'too_many_attempts', retryAfterSeconds: 60 }, 429))
      await advance(59_999)
      expect(result.current.isLocked).toBe(true)
      expect(result.current.error).toBe('ログインの失敗が続いたため、あと 0:01 はログインできません')
      await advance(1)
      expect(result.current.isLocked).toBe(false)
    })

    it.each([
      ['0', 0, '1:00'],
      ['負', -5, '1:00'],
      ['ない', undefined, '1:00'],
      ['文字列', '60', '1:00'],
      ['0.5秒', 0.5, '0:01'],
    ])('retryAfterSeconds が %s → あと %s', async (_label, retryAfterSeconds, shown) => {
      const result = await loginWith(json({ error: 'too_many_attempts', retryAfterSeconds }, 429))
      expect(result.current.error).toBe(`ログインの失敗が続いたため、あと ${shown} はログインできません`)
    })
  })

  describe('同時の試行の自動の送り直しの待ち', () => {
    it.each([
      ['ない', undefined, 1000],
      ['0', 0, 1000],
      ['3秒ちょうど', 3, 3000],
      ['3秒を少し超える', 3.001, 3000],
    ])('retryAfterSeconds が %s → %i ms 待って送り直す', async (_label, retryAfterSeconds, waitMs) => {
      fetchMock.mockResolvedValueOnce(json({ error: 'attempt_in_progress', retryAfterSeconds }, 429)).mockResolvedValueOnce(mfaRequired())
      const { result } = renderHook(() => useLogin())
      act(() => { void result.current.login(credentials) })
      await advance(waitMs - 1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await advance(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('伏せ字の電話番号', () => {
    it.each([['空', ''], ['数値', 1234], ['null', null], ['ない', undefined]])('%s なら出さない（「フロントの電話に」）', async (_label, phoneHint) => {
      const result = await loginWith(json({ mfaRequired: true, ...(phoneHint === undefined ? {} : { phoneHint }) }, 200))
      expect(result.current.step).toBe('code')
      expect(result.current.phoneHint).toBeNull()
    })
  })
})
