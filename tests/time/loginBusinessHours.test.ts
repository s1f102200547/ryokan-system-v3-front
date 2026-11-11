// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setNowJST } from '@tests/utils/timeHelper'

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'uid-1', auth_time: 1_700_000_000 }),
    getUser: vi.fn().mockResolvedValue({ customClaims: undefined }),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    createSessionCookie: vi.fn().mockResolvedValue('cookie'),
  },
  adminDb: {},
}))
// パスワードの確認（Firebase の REST）は常に成功。失敗回数の記録はメモリで数える
vi.mock('@/infra/auth/passwordSignIn', () => ({ signInWithPassword: vi.fn().mockResolvedValue({ success: true, value: { idToken: 'id-token' } }) }))
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { notifySlackFireAndForget } from '@/lib/slack'
import { POST } from '@/app/api/auth/login/route'

// ログインは旅館の PC（Windows）の Chrome・Edge だけ（src/lib/auth/clientCheck.ts）
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const login = () => POST(new Request('http://localhost/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME }, body: JSON.stringify({ email: 'pc1@example.com', password: 'pw' }),
}))

// 画面は 6:00〜23:00 JST だけ開けるが、ログイン API は深夜でも Cookie を発行していた
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
