// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { setNowJST } from '@tests/utils/timeHelper'

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'uid-1', auth_time: 1_700_000_000, firebase: { sign_in_second_factor: 'phone' } }),
    getUser: vi.fn().mockResolvedValue({ customClaims: undefined }),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    createSessionCookie: vi.fn().mockResolvedValue('cookie'),
  },
  adminDb: {},
}))
// SMS のコードの確認（Firebase の REST）は常に成功。失敗回数と途中の状態はメモリ
vi.mock('@/infra/auth/mfaSignIn', () => ({
  finalizePhoneMfa: vi.fn().mockResolvedValue({ success: true, value: { idToken: 'id-token' } }),
  startPhoneMfa: vi.fn(),
}))
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/infra/auth/firestoreMfaPendingRepository', async () => {
  const { createMemoryMfaPendingRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreMfaPendingRepository: createMemoryMfaPendingRepository() }
})
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { POST } from '@/app/api/auth/login/verify/route'

// ログインは旅館の PC（Windows）の Chrome・Edge だけ（src/lib/auth/clientCheck.ts）
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const MIN = 60 * 1000

// Session Cookie の期限は当日 23:00 JST（最低 5 分）。Cookie を発行するのはログインの2段目（SMS のコードの確認）
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
    await firestoreMfaPendingRepository.save('pending-1', {
      email: 'pc1@example.com', ip: null, mfaPendingCredential: 'p', sessionInfo: 's', phoneHint: '', expiresAtMs: Date.now() + 5 * MIN,
    })
    const res = await POST(new Request('http://localhost/api/auth/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME, cookie: 'mfa_pending=pending-1' },
      body: JSON.stringify({ code: '123456' }),
    }))
    expect(res.status).toBe(200)
    expect(vi.mocked(adminAuth.createSessionCookie).mock.calls.at(-1)?.[1]).toEqual({ expiresIn: expected })
    // ブラウザが Cookie を消す時刻（Max-Age）がサーバーの期限と同じ。ずれると、期限切れの Cookie が残る・まだ有効なのに消える
    expect(res.headers.get('set-cookie')).toMatch(new RegExp(`session=cookie;[^\\n]*?Max-Age=${expected / 1000}(;|,|$)`))
  })
})
