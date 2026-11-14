// @vitest-environment node
// ログイン以外の API の時間帯（6:00〜23:05 JST）。requireSession が、セッションを確かめる前に時間外を断る
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JST_BOUNDARY_TIMES, setNowJST } from '@tests/utils/timeHelper'

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { verifySession } from '@/lib/auth/verifySession'
import { notifySlackFireAndForget } from '@/lib/slack'
import { requireSession } from '@/lib/api/routeHelpers'
import { isOutsideApiHours, isOutsideBusinessHours } from '@/lib/businessHours'

const at = (time: string) => Date.parse(`2026-05-20T${time}:00+09:00`)
const request = () => new Request('http://localhost/api/guest-info', { headers: { cookie: 'session=valid' } })

describe('isOutsideApiHours（6:00〜23:05 JST）', () => {
  it.each([
    ['00:00', true], ['05:59', true], ['06:00', false], ['22:59', false],
    ['23:00', false], ['23:04', false], ['23:05', true], ['23:59', true],
  ])('JST %s → 時間外 %s', (time, expected) => {
    expect(isOutsideApiHours(at(time))).toBe(expected)
  })

  it('画面とログイン（23:00 まで）より5分だけ長い。それ以外の時刻は同じ', () => {
    for (const time of JST_BOUNDARY_TIMES) {
      const inGrace = time >= '23:00' && time < '23:05'
      expect(isOutsideApiHours(at(time)), time).toBe(inGrace ? false : isOutsideBusinessHours(at(time)))
    }
  })
})

describe('requireSession の時間帯', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(verifySession).mockResolvedValue({ uid: 'uid-1' })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each(['05:59', '23:05', '23:59'])('本番の JST %s は 403 outside_business_hours。セッションを確かめず、Slack にも送らない', async (time) => {
    vi.stubEnv('NODE_ENV', 'production')
    setNowJST(`2026-05-20T${time}`)
    const response = await requireSession(request(), 'テスト')
    expect(response?.status).toBe(403)
    expect(await response?.json()).toEqual({ error: 'outside_business_hours' })
    expect(verifySession).not.toHaveBeenCalled()
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  it.each(['06:00', '22:59', '23:04'])('本番の JST %s はセッションを確かめて通す', async (time) => {
    vi.stubEnv('NODE_ENV', 'production')
    setNowJST(`2026-05-20T${time}`)
    expect(await requireSession(request(), 'テスト')).toBeNull()
    expect(verifySession).toHaveBeenCalled()
  })

  it('development は時間外でも通す', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    setNowJST('2026-05-20T03:00')
    expect(await requireSession(request(), 'テスト')).toBeNull()
  })
})
