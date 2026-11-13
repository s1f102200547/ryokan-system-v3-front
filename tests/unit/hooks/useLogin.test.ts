import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useLogin } from '@/hooks/auth/useLogin'

// ログイン（AGENTS.md・Domain.md）。2段に分かれる:
//   1. メールアドレスとパスワードを /api/auth/login に送る（パスワードの確認と SMS の送信はサーバー）→ コードの入力へ
//   2. SMS のコードを /api/auth/login/verify に送る（コードの確認と Session Cookie の発行はサーバー）→ ダッシュボードへ
// ブラウザから Firebase は呼ばない。
// 2段目が成功したら移り終わるまで「確認中」のまま（押し直させない）。失敗したら理由を出し、押せる状態に戻す

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

const credentials = { email: 'pc1@example.com', password: 'pw' }
const mfaRequired = () => new Response(JSON.stringify({ mfaRequired: true, phoneHint: '+81*******1234' }), { status: 200 })

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

  it('最初はパスワードの段', () => {
    const { result } = renderHook(() => useLogin())
    expect(result.current.step).toBe('credentials')
    expect(result.current.phoneHint).toBeNull()
  })

  it('メールアドレスとパスワードだけを送り、パスワードが合えばコードの段へ（まだ移らない）', async () => {
    const result = await loginWith(mfaRequired())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'pc1@example.com', password: 'pw' }),
    }))
    expect(result.current.step).toBe('code')
    expect(result.current.phoneHint).toBe('+81*******1234')
    expect(push).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('200 でもコードの段を求めていなければ（想定外の応答）、移らずに障害として出す', async () => {
    const result = await loginWith(new Response('{}', { status: 200 }))
    expect(result.current.step).toBe('credentials')
    expect(push).not.toHaveBeenCalled()
    expect(result.current.error).toBe('サービスが一時的に利用できません。しばらくお待ちください')
  })

  it.each([
    [401, { error: 'invalid_credentials' }, 'メールアドレスまたはパスワードが正しくありません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 60 }, 'ログインの失敗が続いたため、あと 1:00 はログインできません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 61 }, 'ログインの失敗が続いたため、あと 1:01 はログインできません'],
    [429, { error: 'too_many_attempts', retryAfterSeconds: 3600 }, 'ログインの失敗が続いたため、あと 60:00 はログインできません'],
    [429, 'not json', 'ログインの失敗が続いたため、あと 1:00 はログインできません'], // 指定がなければ1分
    [429, { error: 'too_many_attempts', retryAfterSeconds: 'x' }, 'ログインの失敗が続いたため、あと 1:00 はログインできません'],
    [403, { error: 'client_not_allowed' }, 'この PC・ブラウザからはログインできません。'],
    [403, { error: 'mfa_not_enrolled' }, 'このアカウントは SMS の確認が設定されていません。管理者に連絡してください'],
    [429, { error: 'sms_limit' }, '今日の SMS の送信回数の上限に達しました。管理者に連絡してください'],
    [403, { error: 'outside_business_hours' }, '利用時間外です（6:00〜23:00）'],
    [403, 'not json', '利用時間外です（6:00〜23:00）'],
    [500, {}, 'サービスが一時的に利用できません。しばらくお待ちください'],
    [503, {}, 'サービスが一時的に利用できません。しばらくお待ちください'],
  ])('%i（%j）は理由を出し、押せる状態に戻す（移らない）', async (status, body, message) => {
    const result = await loginWith(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
    expect(result.current.error).toBe(message)
    expect(result.current.isPending).toBe(false)
    expect(result.current.step).toBe('credentials')
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

    it('少し待って送り直し、通ればコードの段へ。その間はログイン中のまま', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(mfaRequired())
      const { result } = renderHook(() => useLogin())
      act(() => { void result.current.login(credentials) })
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.current.isPending).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(result.current.step).toBe('code')
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
      fetchMock.mockResolvedValueOnce(busy(600)).mockResolvedValueOnce(mfaRequired())
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
      expect(result.current.error).toBe('ログインの失敗が続いたため、あと 1:00 はログインできません')
    })
  })

  // 失敗が続いて止められたら、画面の入力欄とボタンをすべて押せなくする（読み込み直すまで）
  describe('止められている間（isLocked）', () => {
    it('too_many_attempts を受けたら isLocked。そのあと login を呼んでも送らない', async () => {
      const result = await loginWith(new Response(JSON.stringify({ error: 'too_many_attempts', retryAfterSeconds: 60 }), { status: 429 }))
      expect(result.current.isLocked).toBe(true)
      fetchMock.mockClear()
      await act(async () => { await result.current.login(credentials) })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.error).toBe('ログインの失敗が続いたため、あと 1:00 はログインできません')
    })

    it.each([
      [401, { error: 'invalid_credentials' }],
      [403, { error: 'client_not_allowed' }],
      [403, { error: 'outside_business_hours' }],
      [503, {}],
    ])('%i（%j）では止めない（押し直せる）', async (status, body) => {
      const result = await loginWith(new Response(JSON.stringify(body), { status }))
      expect(result.current.isLocked).toBe(false)
    })

    it('残りの時間を毎秒出し、時間が来たら自動で戻す（メッセージも消え、また送れる）', async () => {
      vi.useFakeTimers()
      try {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'too_many_attempts', retryAfterSeconds: 3 }), { status: 429 }))
        const { result } = renderHook(() => useLogin())
        await act(async () => { await result.current.login(credentials) })
        expect(result.current.error).toBe('ログインの失敗が続いたため、あと 0:03 はログインできません')
        await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
        expect(result.current.error).toBe('ログインの失敗が続いたため、あと 0:02 はログインできません')
        expect(result.current.isLocked).toBe(true)
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        expect(result.current.isLocked).toBe(false)
        expect(result.current.error).toBeNull()

        fetchMock.mockResolvedValueOnce(mfaRequired())
        await act(async () => { await result.current.login(credentials) })
        expect(result.current.step).toBe('code')
      } finally {
        vi.useRealTimers()
      }
    })

    it('PC の時計（Date）が巻き戻っても、待つ時間は変わらない（受け取ってからの経過で数える）', async () => {
      vi.useFakeTimers()
      try {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'too_many_attempts', retryAfterSeconds: 2 }), { status: 429 }))
        const { result } = renderHook(() => useLogin())
        await act(async () => { await result.current.login(credentials) })
        vi.setSystemTime(Date.now() - 60 * 60 * 1000) // 壁時計だけ1時間戻す
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        expect(result.current.isLocked).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('最初は止めていない', () => {
      const { result } = renderHook(() => useLogin())
      expect(result.current.isLocked).toBe(false)
    })
  })

  it('通信エラーは理由を出し、押せる状態に戻す', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useLogin())
    await act(async () => { await result.current.login(credentials) })
    expect(result.current.error).toBe('通信エラーが発生しました。ネットワーク接続を確認してください')
    expect(result.current.isPending).toBe(false)
  })

  // 2段目: SMS のコード
  describe('コードの段', () => {
    async function atCodeStep() {
      fetchMock.mockResolvedValueOnce(mfaRequired())
      const { result } = renderHook(() => useLogin())
      await act(async () => { await result.current.login(credentials) })
      expect(result.current.step).toBe('code')
      fetchMock.mockClear()
      return result
    }
    async function verifyWith(response: Response) {
      const result = await atCodeStep()
      fetchMock.mockResolvedValueOnce(response)
      await act(async () => { await result.current.verify('123456') })
      return result
    }

    it('コードだけを verify に送り、合えばダッシュボードへ直接移る。移り終わるまで isPending のまま', async () => {
      const result = await verifyWith(new Response(JSON.stringify({ success: true }), { status: 200 }))
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login/verify', expect.objectContaining({
        method: 'POST', body: JSON.stringify({ code: '123456' }),
      }))
      expect(push).toHaveBeenCalledWith('/daily-dashboard')
      expect(result.current.isPending).toBe(true)
    })

    it('コードが違えば理由を出し、コードの段のまま打ち直せる', async () => {
      const result = await verifyWith(new Response(JSON.stringify({ error: 'invalid_code' }), { status: 401 }))
      expect(result.current.error).toBe('コードが正しくありません')
      expect(result.current.step).toBe('code')
      expect(result.current.isPending).toBe(false)
      expect(push).not.toHaveBeenCalled()
    })

    it('期限が切れたら、パスワードの段へ戻して理由を出す', async () => {
      const result = await verifyWith(new Response(JSON.stringify({ error: 'mfa_expired' }), { status: 401 }))
      expect(result.current.step).toBe('credentials')
      expect(result.current.error).toBe('コードの有効期限が切れました。もう一度ログインしてください')
    })

    it.each([
      [429, { error: 'too_many_attempts', retryAfterSeconds: 60 }, 'ログインの失敗が続いたため、あと 1:00 はログインできません'],
      [403, { error: 'client_not_allowed' }, 'この PC・ブラウザからはログインできません。'],
      [403, { error: 'no_second_factor' }, 'このアカウントは SMS の確認が設定されていません。管理者に連絡してください'],
      [403, { error: 'outside_business_hours' }, '利用時間外です（6:00〜23:00）'],
      [503, {}, 'サービスが一時的に利用できません。しばらくお待ちください'],
    ])('%i（%j）は理由を出し、コードの段のまま', async (status, body, message) => {
      const result = await verifyWith(new Response(JSON.stringify(body), { status }))
      expect(result.current.error).toBe(message)
      expect(result.current.step).toBe('code')
      expect(push).not.toHaveBeenCalled()
    })

    it('止められている間は、コードを送らない', async () => {
      const result = await verifyWith(new Response(JSON.stringify({ error: 'too_many_attempts', retryAfterSeconds: 60 }), { status: 429 }))
      fetchMock.mockClear()
      await act(async () => { await result.current.verify('123456') })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('再送は、同じメールアドレスとパスワードで1段目を送り直し、知らせを出す', async () => {
      const result = await atCodeStep()
      fetchMock.mockResolvedValueOnce(mfaRequired())
      await act(async () => { await result.current.resend() })
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        body: JSON.stringify({ email: 'pc1@example.com', password: 'pw' }),
      }))
      expect(result.current.step).toBe('code')
      expect(result.current.notice).toBe('コードを再送しました')
      expect(result.current.error).toBeNull()
    })

    it('再送が SMS の上限で断られたら理由を出す（知らせは出さない）', async () => {
      const result = await atCodeStep()
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'sms_limit' }), { status: 429 }))
      await act(async () => { await result.current.resend() })
      expect(result.current.error).toBe('今日の SMS の送信回数の上限に達しました。管理者に連絡してください')
      expect(result.current.notice).toBeNull()
    })

    it('SMS の送信の障害（503）は、障害として出す', async () => {
      const result = await atCodeStep()
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
      await act(async () => { await result.current.resend() })
      expect(result.current.error).toBe('サービスが一時的に利用できません。しばらくお待ちください')
    })

    it('戻るで、パスワードの段へ戻る（エラーも消す）', async () => {
      const result = await verifyWith(new Response(JSON.stringify({ error: 'invalid_code' }), { status: 401 }))
      act(() => { result.current.back() })
      expect(result.current.step).toBe('credentials')
      expect(result.current.error).toBeNull()
    })

    it('通信エラーは理由を出し、押せる状態に戻す', async () => {
      const result = await atCodeStep()
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await act(async () => { await result.current.verify('123456') })
      expect(result.current.error).toBe('通信エラーが発生しました。ネットワーク接続を確認してください')
      expect(result.current.isPending).toBe(false)
    })
  })

  // 本番: SMS を送る前に、reCAPTCHA Enterprise の token を作って一緒に送る
  describe('reCAPTCHA の token', () => {
    it('1段目を送る直前に token を作り、body に入れる', async () => {
      const getRecaptchaToken = vi.fn().mockResolvedValue('token-1')
      fetchMock.mockResolvedValue(mfaRequired())
      const { result } = renderHook(() => useLogin({ getRecaptchaToken }))
      await act(async () => { await result.current.login(credentials) })
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
        body: JSON.stringify({ email: 'pc1@example.com', password: 'pw', recaptchaToken: 'token-1' }),
      }))
      expect(result.current.step).toBe('code')
    })

    it('再送のたびに新しい token を作る（token は使い捨て）', async () => {
      const getRecaptchaToken = vi.fn().mockResolvedValueOnce('token-1').mockResolvedValueOnce('token-2')
      fetchMock.mockResolvedValue(mfaRequired())
      const { result } = renderHook(() => useLogin({ getRecaptchaToken }))
      await act(async () => { await result.current.login(credentials) })
      await act(async () => { await result.current.resend() })
      expect(getRecaptchaToken).toHaveBeenCalledTimes(2)
      expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).recaptchaToken).toBe('token-2')
    })

    it('コードの確認（2段目）では作らない', async () => {
      const getRecaptchaToken = vi.fn().mockResolvedValue('token-1')
      fetchMock.mockResolvedValueOnce(mfaRequired()).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      const { result } = renderHook(() => useLogin({ getRecaptchaToken }))
      await act(async () => { await result.current.login(credentials) })
      await act(async () => { await result.current.verify('123456') })
      expect(getRecaptchaToken).toHaveBeenCalledTimes(1)
    })

    it('reCAPTCHA を読み込めなければ、パスワードを送らずに理由を出す', async () => {
      const getRecaptchaToken = vi.fn().mockRejectedValue(new Error('reCAPTCHA load failed'))
      const { result } = renderHook(() => useLogin({ getRecaptchaToken }))
      await act(async () => { await result.current.login(credentials) })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.error).toBe('ブラウザの確認（reCAPTCHA）を読み込めませんでした。ページを読み込み直して、もう一度お試しください')
      expect(result.current.isPending).toBe(false)
    })

    it('Google が token を断った（403 recaptcha_failed）ら、読み込み直しを促す', async () => {
      const result = await loginWith(new Response(JSON.stringify({ error: 'recaptcha_failed' }), { status: 403 }))
      expect(result.current.error).toBe('ブラウザの確認（reCAPTCHA）で止められました。ページを読み込み直して、もう一度お試しください')
    })

    it('token を作る関数がなければ（開発・Emulator）、token なしで送る', async () => {
      await loginWith(mfaRequired())
      expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ email: 'pc1@example.com', password: 'pw' })
    })
  })
})
