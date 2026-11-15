// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
// パスワードの確認・SMS の送信・コードの確認（Firebase の REST）は常に成功。回数・途中の状態はメモリ
vi.mock('@/infra/auth/passwordSignIn', () => ({
  signInWithPassword: vi.fn().mockResolvedValue({ success: true, value: { kind: 'mfa_required', mfaPendingCredential: 'p', mfaEnrollmentId: 'e', phoneHint: '+81***' } }),
  isPasswordSignInConfigured: () => true,
}))
vi.mock('@/infra/auth/mfaSignIn', () => ({
  startPhoneMfa: vi.fn().mockResolvedValue({ success: true, value: { sessionInfo: 's' } }),
  finalizePhoneMfa: vi.fn().mockResolvedValue({ success: true, value: { idToken: 'id-token' } }),
}))
vi.mock('@/infra/auth/firestoreLoginThrottleRepository', async () => {
  const { createMemoryLoginThrottleRepository } = await import('@tests/utils/memoryLoginThrottleRepository')
  return { firestoreLoginThrottleRepository: createMemoryLoginThrottleRepository() }
})
vi.mock('@/infra/auth/firestoreMfaPendingRepository', async () => {
  const { createMemoryMfaPendingRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreMfaPendingRepository: createMemoryMfaPendingRepository() }
})
vi.mock('@/infra/auth/firestoreSmsQuotaRepository', async () => {
  const { createMemorySmsQuotaRepository } = await import('@tests/utils/memoryMfaRepositories')
  return { firestoreSmsQuotaRepository: createMemorySmsQuotaRepository() }
})
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { notifySlackFireAndForget } from '@/lib/slack'
import { signInWithPassword } from '@/infra/auth/passwordSignIn'
import { finalizePhoneMfa, startPhoneMfa } from '@/infra/auth/mfaSignIn'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { POST as VERIFY } from '@/app/api/auth/login/verify/route'

// ログインは旅館の PC（Windows）の Chrome・Edge だけ（src/lib/auth/clientCheck.ts）
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const login = () => LOGIN(new Request('http://localhost/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME }, body: JSON.stringify({ email: 'pc1@example.com', password: 'pw1' }),
}))
const verify = async () => {
  await firestoreMfaPendingRepository.save('pending-1', {
    email: 'pc1@example.com', ip: null, mfaPendingCredential: 'p', sessionInfo: 's', phoneHint: '', expiresAtMs: Date.now() + 60_000,
  })
  return VERIFY(new Request('http://localhost/api/auth/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME, cookie: 'mfa_pending=pending-1' },
    body: JSON.stringify({ code: '123456' }),
  }))
}

// 画面は 6:00〜23:00 JST だけ開けるが、ログイン API は深夜でも Cookie を発行していた。
// 1段目（パスワード → SMS）も2段目（コード → Cookie）も、同じ時間帯で断る
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
    expect((await login()).status).toBe(status)
    expect((await verify()).status).toBe(status)
    if (status === 403) {
      // 時間外はパスワードもコードも確かめず、SMS を送らず、Cookie を発行しない。入力が原因なので通知しない
      expect(signInWithPassword).not.toHaveBeenCalled()
      expect(startPhoneMfa).not.toHaveBeenCalled()
      expect(finalizePhoneMfa).not.toHaveBeenCalled()
      expect(adminAuth.createSessionCookie).not.toHaveBeenCalled()
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    }
  })

  it('development は時間外でもログインできる', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    setNowJST('2026-05-20T03:00')
    expect((await login()).status).toBe(200)
    expect((await verify()).status).toBe(200)
  })
})
