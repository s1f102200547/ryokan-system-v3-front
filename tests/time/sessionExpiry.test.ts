// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { setNowJST } from '@tests/utils/timeHelper'

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn().mockResolvedValue({}), createSessionCookie: vi.fn().mockResolvedValue('cookie') },
  adminDb: {},
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { POST } from '@/app/api/auth/login/route'

const MIN = 60 * 1000

// Session Cookie の期限は当日 23:00 JST（最低 5 分）
describe('ログイン時の Session Cookie の期限', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['00:00', 23 * 60 * MIN],
    ['06:00', 17 * 60 * MIN],
    ['08:59', (14 * 60 + 1) * MIN],
    ['09:00', 14 * 60 * MIN],
    ['22:54', 6 * MIN],
    ['22:56', 5 * MIN],
    ['23:00', 5 * MIN],
    ['23:59', 5 * MIN],
  ] as const)('JST %s → %i ms', async (time, expected) => {
    vi.useFakeTimers()
    setNowJST(`2026-05-20T${time}`)
    const res = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 't' }),
    }))
    expect(res.status).toBe(200)
    expect(vi.mocked(adminAuth.createSessionCookie).mock.calls.at(-1)?.[1]).toEqual({ expiresIn: expected })
  })
})
