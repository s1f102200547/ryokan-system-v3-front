import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'

// 401 はログイン画面へ、時間外の 403 は利用時間外のページへ移る（結果を返さずに待たせる）。ほかはそのまま返す
describe('fetchWithSession', () => {
  const assign = vi.fn()
  const fetchMock = vi.fn()
  beforeEach(() => {
    assign.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', { pathname: '/daily-dashboard', assign })
  })
  afterEach(() => vi.unstubAllGlobals())

  // 移るときは Promise が決まらない。少し待って決まっていないことを見る
  async function settles(p: Promise<Response>): Promise<Response | 'pending'> {
    return Promise.race([p, new Promise<'pending'>((r) => setTimeout(() => r('pending'), 20))])
  }

  it('401 はログイン画面へ移り、結果を返さない', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))
    expect(await settles(fetchWithSession('/api/guest-info'))).toBe('pending')
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('時間外の 403（outside_business_hours）は利用時間外のページへ移る', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'outside_business_hours' }), { status: 403 }))
    expect(await settles(fetchWithSession('/api/guest-info'))).toBe('pending')
    expect(assign).toHaveBeenCalledWith('/time-restricted')
  })

  it.each([
    ['ほかの理由の 403', 403, { error: 'forbidden' }],
    ['本文が JSON でない 403', 403, 'not json'],
    ['200', 200, { ok: true }],
    ['500', 500, {}],
  ])('%s はそのまま返し（本文も読める）、移らない', async (_label, status, body) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    fetchMock.mockResolvedValue(new Response(text, { status }))
    const res = await settles(fetchWithSession('/api/guest-info'))
    expect(res).not.toBe('pending')
    expect(await (res as Response).text()).toBe(text)
    expect(assign).not.toHaveBeenCalled()
  })

  it('利用時間外のページにいるときは、時間外の 403 でも移らない（読み込み直しを繰り返さない）', async () => {
    vi.stubGlobal('location', { pathname: '/time-restricted', assign })
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'outside_business_hours' }), { status: 403 }))
    expect(await settles(fetchWithSession('/api/x'))).not.toBe('pending')
    expect(assign).not.toHaveBeenCalled()
  })
})
