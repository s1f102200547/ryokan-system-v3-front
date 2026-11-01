// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setNowJST } from '@tests/utils/timeHelper'

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn().mockResolvedValue({}), createSessionCookie: vi.fn().mockResolvedValue('cookie') },
  adminDb: {},
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { notifySlackFireAndForget } from '@/lib/slack'
import { POST } from '@/app/api/auth/login/route'

const login = () => POST(new Request('http://localhost/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: 't' }),
}))

// BugHunting.md #14: 画面は 6:00〜23:00 JST だけ開けるが、ログイン API は深夜でも Cookie を発行していた
describe('ログイン API の時間帯制限', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([
    ['00:00', 403], ['05:59', 403], ['06:00', 200], ['22:59', 200], ['23:00', 403], ['23:59', 403],
  ] as const)('production: JST %s → %i', async (time, status) => {
    vi.stubEnv('NODE_ENV', 'production')
    setNowJST(`2026-05-20T${time}`)
    const res = await login()
    expect(res.status).toBe(status)
    if (status === 403) {
      // 時間外は idToken を検証せず、Cookie を発行しない。入力が原因なので通知しない
      expect(adminAuth.verifyIdToken).not.toHaveBeenCalled()
      expect(adminAuth.createSessionCookie).not.toHaveBeenCalled()
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    }
  })

  it('development は時間外でもログインできる', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    setNowJST('2026-05-20T03:00')
    expect((await login()).status).toBe(200)
  })
})
