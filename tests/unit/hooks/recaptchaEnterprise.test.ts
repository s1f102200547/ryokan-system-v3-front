import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MFA_RECAPTCHA_ACTION, RECAPTCHA_ENTERPRISE_SCRIPT_URL } from '@/constants/auth'

// reCAPTCHA Enterprise の token を作る（src/hooks/auth/recaptchaEnterprise.ts。docs/MfaBugHunt.md の S7）。
// 読み込みの成功・失敗・期限、読み込み済みの再利用、ready・execute が返らないとき（F-05）。
// 本物の Google には繋がない。script の読み込みは、足された <script> の onload・onerror を手で呼んで作る

type Enterprise = { ready(cb: () => void): void; execute(key: string, opts: { action: string }): Promise<string> }
const SITE_KEY = '6Ldi8xwuAAAAAOPV8MlkljionzTDwYq2eke07CUF'

// モジュールの中の「読み込み中」を、テストごとに空にする
async function load() {
  vi.resetModules()
  return import('@/hooks/auth/recaptchaEnterprise')
}

const enterprise = (overrides: Partial<Enterprise> = {}): Enterprise => ({
  ready: (cb) => cb(),
  execute: vi.fn(async () => 'token-from-google'),
  ...overrides,
})

describe('createRecaptchaTokenGetter', () => {
  let appended: HTMLScriptElement[]
  beforeEach(() => {
    vi.useFakeTimers()
    appended = []
    vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      for (const n of nodes) if (n instanceof HTMLScriptElement) appended.push(n)
    })
    delete window.grecaptcha
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    delete window.grecaptcha
  })

  // 読み込みが終わったことにする（Google の script が window.grecaptcha を置いて onload）
  const finishLoading = (e: Enterprise | undefined) => {
    window.grecaptcha = e === undefined ? {} : { enterprise: e }
    appended.at(-1)?.onload?.(new Event('load'))
  }

  it('script をサイトキー付きで読み込み、ログインの action で token を作る', async () => {
    const { createRecaptchaTokenGetter } = await load()
    const e = enterprise()
    const token = createRecaptchaTokenGetter(SITE_KEY)()
    expect(appended).toHaveLength(1)
    expect(appended[0].src).toBe(`${RECAPTCHA_ENTERPRISE_SCRIPT_URL}?render=${SITE_KEY}`)
    expect(appended[0].async).toBe(true)
    finishLoading(e)
    await expect(token).resolves.toBe('token-from-google')
    expect(e.execute).toHaveBeenCalledWith(SITE_KEY, { action: MFA_RECAPTCHA_ACTION })
  })

  it('読み込み済みなら script を足さずに使う（再送のたびに読み込まない）', async () => {
    const { createRecaptchaTokenGetter } = await load()
    window.grecaptcha = { enterprise: enterprise() }
    await expect(createRecaptchaTokenGetter(SITE_KEY)()).resolves.toBe('token-from-google')
    expect(appended).toHaveLength(0)
  })

  it('同時に2回求めても、script は1回だけ足す', async () => {
    const { createRecaptchaTokenGetter } = await load()
    const get = createRecaptchaTokenGetter(SITE_KEY)
    const a = get()
    const b = get()
    expect(appended).toHaveLength(1)
    finishLoading(enterprise())
    await expect(Promise.all([a, b])).resolves.toEqual(['token-from-google', 'token-from-google'])
  })

  it.each<[string, (s: HTMLScriptElement) => void, string]>([
    ['読み込めない（onerror）', (s) => s.onerror?.(new Event('error')), 'reCAPTCHA load failed'],
    ['読み込んだのに enterprise がない', () => finishLoading(undefined), 'reCAPTCHA not available'],
  ])('%s → 失敗を返し、次に押したときは読み込み直す', async (_label, fail, message) => {
    const { createRecaptchaTokenGetter } = await load()
    const get = createRecaptchaTokenGetter(SITE_KEY)
    const first = get()
    fail(appended[0])
    await expect(first).rejects.toThrow(message)

    const second = get()
    expect(appended).toHaveLength(2)
    finishLoading(enterprise())
    await expect(second).resolves.toBe('token-from-google')
  })

  it('10秒たっても読み込みが終わらなければ失敗を返す', async () => {
    const { createRecaptchaTokenGetter } = await load()
    const token = createRecaptchaTokenGetter(SITE_KEY)()
    const settled = expect(token).rejects.toThrow('reCAPTCHA timeout')
    await vi.advanceTimersByTimeAsync(10_000)
    await settled
  })

  it('execute が失敗したら、その失敗を返す', async () => {
    const { createRecaptchaTokenGetter } = await load()
    window.grecaptcha = { enterprise: enterprise({ execute: async () => { throw new Error('network') } }) }
    await expect(createRecaptchaTokenGetter(SITE_KEY)()).rejects.toThrow('network')
  })

  // 読み込みには10秒の期限があるが、その後の ready・execute には期限がない。返らなければ、ログイン画面は「ログイン中…」のまま
  it.fails.each<[string, Partial<Enterprise>]>([
    ['ready が呼ばれない', { ready: () => {} }],
    ['execute が返らない', { execute: () => new Promise<string>(() => {}) }],
  ])('[F-05] %s → 30秒以内に失敗を返す', async (_label, overrides) => {
    const { createRecaptchaTokenGetter } = await load()
    window.grecaptcha = { enterprise: enterprise(overrides) }
    let settled = false
    createRecaptchaTokenGetter(SITE_KEY)().then(() => { settled = true }, () => { settled = true })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(settled).toBe(true) // 今は返らない（F-05）。直したら it.fails を外す
  })
})
