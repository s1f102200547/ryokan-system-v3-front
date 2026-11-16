import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useLogin } from '@/hooks/auth/useLogin'

// ログイン画面の状態遷移（docs/MfaSpecTrace.md「ログイン画面の状態遷移」、docs/MfaBugHunt.md の S7）。
// 表の各行を1つずつ確かめる。状態: P（パスワードの段）/ C（コードの段）/ 🔒（止められている）/ →（ダッシュボードへ）

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

const credentials = { email: 'pc1@example.com', password: 'pw' }
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status })
const MFA = () => json({ mfaRequired: true, phoneHint: '+81*******1234' }, 200)
const never = () => new Promise<Response>(() => {})

type Seen = { step: 'credentials' | 'code'; isPending: boolean; isLocked: boolean; pushed: boolean; error: string | null; notice: string | null }

describe('useLogin の状態遷移', () => {
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

  type Hook = ReturnType<typeof renderHook<ReturnType<typeof useLogin>, unknown>>
  const seen = (h: Hook): Seen => ({
    step: h.result.current.step, isPending: h.result.current.isPending, isLocked: h.result.current.isLocked,
    pushed: push.mock.calls.length > 0, error: h.result.current.error, notice: h.result.current.notice,
  })
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  // P から始める
  const atP = () => renderHook(() => useLogin())
  // C から始める（再送の待ちは過ぎた状態）
  async function atC(): Promise<Hook> {
    const h = atP()
    fetchMock.mockResolvedValueOnce(MFA())
    await act(async () => { await h.result.current.login(credentials) })
    await advance(30_000)
    fetchMock.mockClear()
    return h
  }
  async function atLocked(from: 'P' | 'C'): Promise<Hook> {
    const h = from === 'P' ? atP() : await atC()
    fetchMock.mockResolvedValueOnce(json({ error: 'too_many_attempts', retryAfterSeconds: 60 }, 429))
    await act(async () => { if (from === 'P') await h.result.current.login(credentials); else await h.result.current.verify('123456') })
    fetchMock.mockClear()
    return h
  }

  describe('P… から（1段目の応答）', () => {
    it.each<[string, () => Response, Partial<Seen>]>([
      ['200 mfaRequired → C', MFA, { step: 'code', isPending: false, pushed: false, error: null }],
      ['200 success → ダッシュボード（移り終わるまで確認中）', () => json({ success: true }, 200), { step: 'credentials', isPending: true, pushed: true }],
      ['401 invalid_credentials → P', () => json({ error: 'invalid_credentials' }, 401), { step: 'credentials', isPending: false, error: 'メールアドレスまたはパスワードが正しくありません' }],
      ['401 login_failed → P', () => json({ error: 'login_failed' }, 401), { step: 'credentials', error: 'ログインできませんでした。もう一度ログインしてください' }],
      ['429 too_many_attempts → P🔒', () => json({ error: 'too_many_attempts', retryAfterSeconds: 60 }, 429), { step: 'credentials', isLocked: true }],
      ['429 sms_limit → P', () => json({ error: 'sms_limit' }, 429), { step: 'credentials', isLocked: false, error: '今日の SMS の送信回数の上限に達しました。管理者に連絡してください' }],
      ['403 mfa_not_enrolled → P', () => json({ error: 'mfa_not_enrolled' }, 403), { step: 'credentials', error: 'このアカウントは SMS の確認が設定されていません。管理者に連絡してください' }],
      ['503 → P', () => json({}, 503), { step: 'credentials', isPending: false, error: 'サービスが一時的に利用できません。しばらくお待ちください' }],
    ])('%s', async (_name, response, expected) => {
      const h = atP()
      fetchMock.mockResolvedValueOnce(response())
      await act(async () => { await h.result.current.login(credentials) })
      expect(seen(h)).toMatchObject(expected)
    })

    it('reCAPTCHA を読み込めない → P（パスワードを送らない）', async () => {
      const h = renderHook(() => useLogin({ getRecaptchaToken: () => Promise.reject(new Error('blocked')) }))
      await act(async () => { await h.result.current.login(credentials) })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(seen(h)).toMatchObject({ step: 'credentials', isPending: false })
      expect(h.result.current.error).toMatch(/reCAPTCHA/)
    })
  })

  describe('C… から（コードの確認の応答）', () => {
    it.each<[string, () => Response, Partial<Seen>]>([
      ['200 → ダッシュボード', () => json({ success: true }, 200), { step: 'code', isPending: true, pushed: true }],
      ['401 invalid_code → C', () => json({ error: 'invalid_code' }, 401), { step: 'code', isPending: false, error: 'コードが正しくありません' }],
      ['401 mfa_expired → P', () => json({ error: 'mfa_expired' }, 401), { step: 'credentials', error: 'コードの有効期限が切れました。もう一度ログインしてください' }],
      ['401 login_failed → P', () => json({ error: 'login_failed' }, 401), { step: 'credentials', error: 'ログインできませんでした。もう一度ログインしてください' }],
      ['429 too_many_attempts → C🔒', () => json({ error: 'too_many_attempts', retryAfterSeconds: 60 }, 429), { step: 'code', isLocked: true }],
      ['403 client_not_allowed → C', () => json({ error: 'client_not_allowed' }, 403), { step: 'code', isPending: false, error: 'この PC もしくはブラウザからはログインできません。' }],
      ['503 → C', () => json({}, 503), { step: 'code', isPending: false, error: 'サービスが一時的に利用できません。しばらくお待ちください' }],
    ])('%s', async (_name, response, expected) => {
      const h = await atC()
      fetchMock.mockResolvedValueOnce(response())
      await act(async () => { await h.result.current.verify('123456') })
      expect(seen(h)).toMatchObject(expected)
    })

    it('通信エラー → C', async () => {
      const h = await atC()
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await act(async () => { await h.result.current.verify('123456') })
      expect(seen(h)).toMatchObject({ step: 'code', isPending: false, error: '通信エラーが発生しました。ネットワーク接続を確認してください' })
    })
  })

  describe('C での再送', () => {
    it('200 mfaRequired → C（知らせを出し、また30秒待たせる）', async () => {
      const h = await atC()
      fetchMock.mockResolvedValueOnce(MFA())
      await act(async () => { await h.result.current.resend() })
      expect(seen(h)).toMatchObject({ step: 'code', isPending: false, notice: 'コードを再送しました', error: null })
      expect(h.result.current.resendWaitSeconds).toBe(30)
    })

    // 再送で断られても、コードの段のまま理由を出す（F-13: パスワードの誤り・電話の未登録でも、戻るしかできない）
    it.each<[string, () => Response, string]>([
      ['401 invalid_credentials', () => json({ error: 'invalid_credentials' }, 401), 'メールアドレスまたはパスワードが正しくありません'],
      ['403 mfa_not_enrolled', () => json({ error: 'mfa_not_enrolled' }, 403), 'このアカウントは SMS の確認が設定されていません。管理者に連絡してください'],
      ['429 sms_limit', () => json({ error: 'sms_limit' }, 429), '今日の SMS の送信回数の上限に達しました。管理者に連絡してください'],
    ])('%s → C のまま理由を出す', async (_name, response, error) => {
      const h = await atC()
      fetchMock.mockResolvedValueOnce(response())
      await act(async () => { await h.result.current.resend() })
      expect(seen(h)).toMatchObject({ step: 'code', isPending: false, error, notice: null })
    })
  })

  describe('止められている間（P🔒・C🔒）', () => {
    it.each(['P', 'C'] as const)('%s🔒 では login・verify・resend のどれも送らない。時間が来たら元の段へ戻る', async (from) => {
      const h = await atLocked(from)
      await act(async () => {
        await h.result.current.login(credentials)
        await h.result.current.verify('123456')
        await h.result.current.resend()
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(seen(h)).toMatchObject({ step: from === 'P' ? 'credentials' : 'code', isLocked: true })
      await advance(60_000)
      expect(seen(h)).toMatchObject({ step: from === 'P' ? 'credentials' : 'code', isLocked: false, error: null })
    })

    it('C🔒 で戻ると P🔒（止められている状態は残る）', async () => {
      const h = await atLocked('C')
      act(() => { h.result.current.back() })
      expect(seen(h)).toMatchObject({ step: 'credentials', isLocked: true })
      expect(h.result.current.error).toMatch(/^ログインの失敗が続いたため/)
    })
  })

  describe('C での戻る', () => {
    it('C → P。エラーと知らせを消す', async () => {
      const h = await atC()
      fetchMock.mockResolvedValueOnce(json({ error: 'invalid_code' }, 401))
      await act(async () => { await h.result.current.verify('123456') })
      act(() => { h.result.current.back() })
      expect(seen(h)).toMatchObject({ step: 'credentials', error: null, notice: null })
    })
  })

  describe('送らないはずのとき', () => {
    it('C…（確認中）に verify を呼んでも送らない（描画のあと）', async () => {
      const h = await atC()
      fetchMock.mockImplementation(never)
      act(() => { void h.result.current.verify('123456') })
      await advance(0)
      expect(h.result.current.isPending).toBe(true)
      let sentAgain = true
      await act(async () => { sentAgain = await h.result.current.verify('123456') })
      expect(sentAgain).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    // 確認中かを state で見ているので、描画の前に2回呼ばれると2回送る（hook のコメント「確認中は送らない」に反する）
    it.fails('[F-12] 同じ描画の中で verify を2回呼んでも、送るのは1回', async () => {
      const h = await atC()
      fetchMock.mockImplementation(never)
      act(() => {
        void h.result.current.verify('123456')
        void h.result.current.verify('123456')
      })
      await advance(0)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    // 返らない token を待ち続け、「ログイン中…」から戻らない。パスワードも送らない
    it.fails('[F-05] reCAPTCHA の token が返らないとき、しばらくして理由を出し、押せる状態に戻る', async () => {
      const h = renderHook(() => useLogin({ getRecaptchaToken: () => new Promise<string>(() => {}) }))
      act(() => { void h.result.current.login(credentials) })
      await advance(60_000)
      expect(h.result.current.isPending).toBe(false)
      expect(h.result.current.error).not.toBeNull()
    })
  })
})
