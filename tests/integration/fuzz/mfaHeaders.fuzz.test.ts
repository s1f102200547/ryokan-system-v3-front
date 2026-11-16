import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'

// ログインの2つの API のヘッダーのファジング（docs/MfaBugHunt.md の S10）。routes.fuzz.test.ts は body を壊す（Command はモック）。
// ここでは Command を本物にし（回数・途中の状態はメモリ、Identity Toolkit はモック）、利用者が自由に書ける
// Cookie・X-Forwarded-For・User-Agent を壊す。判定: 5xx・[ALERT] にならない。途中の状態と接続元が合わなければコードを確かめない

vi.mock('@/infra/auth/passwordSignIn', () => ({ signInWithPassword: vi.fn(), isPasswordSignInConfigured: () => true }))
import { signInWithPassword } from '@/infra/auth/passwordSignIn'
vi.mock('@/infra/auth/mfaSignIn', () => ({ startPhoneMfa: vi.fn(), finalizePhoneMfa: vi.fn() }))
import { finalizePhoneMfa, startPhoneMfa } from '@/infra/auth/mfaSignIn'
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
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { firestoreSmsQuotaRepository } from '@/infra/auth/firestoreSmsQuotaRepository'
import type { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
import type { createMemoryMfaPendingRepository, createMemorySmsQuotaRepository } from '@tests/utils/memoryMfaRepositories'
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'u1', email: 'pc1@example.com', auth_time: 1_700_000_000, firebase: { sign_in_second_factor: 'phone' } }),
    getUser: vi.fn().mockResolvedValue({ customClaims: undefined }),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    createSessionCookie: vi.fn().mockResolvedValue('session-cookie'),
  },
  adminDb: {},
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'
import { forwardedIps } from '@/lib/auth/loginNotice'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { POST as VERIFY } from '@/app/api/auth/login/verify/route'

const throttle = firestoreLoginThrottleRepository as ReturnType<typeof createMemoryLoginThrottleRepository>
const pendings = firestoreMfaPendingRepository as ReturnType<typeof createMemoryMfaPendingRepository>
const quota = firestoreSmsQuotaRepository as ReturnType<typeof createMemorySmsQuotaRepository>

const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const PENDING_ID = 'real-pending-id-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const SAVED_IP = '203.0.113.5'

// ヘッダーに書ける文字（Latin-1。改行と NUL は Request が受け付けない）
const latin1 = fc.array(fc.integer({ min: 0x20, max: 0xff }), { maxLength: 60 }).map((cs) => String.fromCharCode(...cs))
const ipish = fc.oneof(fc.ipV4(), fc.ipV6(), fc.constant(SAVED_IP), fc.constant(SAVED_IP.toUpperCase()), fc.constant(`::ffff:${SAVED_IP}`), latin1)
const separator = fc.constantFrom(',', ', ', ' , ')
const ipList = fc.tuple(fc.array(ipish, { minLength: 1, maxLength: 6 }), separator).map(([a, sep]) => a.join(sep))
// 右端が保存した接続元のもの（左側は利用者が自由に書ける）を多めに出す
const endsWithSaved = fc.tuple(fc.array(ipish, { maxLength: 4 }), separator).map(([a, sep]) => [...a, SAVED_IP].join(sep))
const forwardedFor = fc.option(fc.oneof({ arbitrary: endsWithSaved, weight: 3 }, { arbitrary: ipList, weight: 2 }, { arbitrary: latin1, weight: 1 }), { nil: null })
const userAgent = fc.option(fc.oneof(latin1, fc.constant(WINDOWS_CHROME), fc.constant(`${WINDOWS_CHROME} ${'x'.repeat(4000)}`)), { nil: null })
const cookieValue = fc.oneof({ arbitrary: fc.constant(PENDING_ID), weight: 4 }, fc.constant(''), fc.stringMatching(/^[A-Za-z0-9_\-=.%]{0,60}$/), latin1.map((s) => s.replace(/;/g, '')), fc.constant('x'.repeat(8000)))
const cookie = fc.option(fc.oneof(
  cookieValue.map((v) => `mfa_pending=${v}`),
  fc.tuple(cookieValue, cookieValue).map(([a, b]) => `mfa_pending=${a}; mfa_pending=${b}`),
  fc.tuple(latin1, cookieValue).map(([junk, v]) => `${junk.replace(/;/g, '')}; mfa_pending=${v}`),
  latin1,
), { nil: null })

function request(url: string, body: object, h: { cookie: string | null; forwardedFor: string | null; userAgent: string | null }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (h.cookie !== null) headers.cookie = h.cookie
  if (h.forwardedFor !== null) headers['x-forwarded-for'] = h.forwardedFor
  if (h.userAgent !== null) headers['user-agent'] = h.userAgent
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}
const slackKinds = () => vi.mocked(notifySlackFireAndForget).mock.calls.map(([m]) => /^\[([^\]]+)\]/.exec(String(m))?.[1])

describe('ログインの API のヘッダーのファジング', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    throttle.clear(); pendings.clear(); quota.clear()
    vi.mocked(signInWithPassword).mockResolvedValue({ success: true, value: { kind: 'mfa_required', mfaPendingCredential: 'cred', mfaEnrollmentId: 'e', phoneHint: '+81***' } })
    vi.mocked(startPhoneMfa).mockResolvedValue({ success: true, value: { sessionInfo: 's' } })
    vi.mocked(finalizePhoneMfa).mockResolvedValue({ success: true, value: { idToken: 'id-token' } })
  })

  it('1段目: どんな Cookie・X-Forwarded-For・User-Agent でも 5xx にならず、[ALERT] を出さない。SMS は Windows の Chrome・Edge にだけ送る', async () => {
    await fc.assert(fc.asyncProperty(cookie, forwardedFor, userAgent, async (c, f, u) => {
      vi.mocked(notifySlackFireAndForget).mockClear()
      vi.mocked(startPhoneMfa).mockClear()
      throttle.clear(); quota.clear()
      const res = await LOGIN(request('http://localhost/api/auth/login', { email: 'pc1@example.com', password: 'pw1' }, { cookie: c, forwardedFor: f, userAgent: u }))
      expect([200, 403]).toContain(res.status)
      expect(slackKinds().every((k) => k === 'ログイン拒否')).toBe(true)
      expect(vi.mocked(startPhoneMfa).mock.calls.length).toBe(res.status === 200 ? 1 : 0)
    }), { numRuns: 300 })
  })

  let finalized = 0
  it('2段目: どんなヘッダーでも 5xx にならず、[ALERT] を出さない。コードを確かめるのは、本物の途中の状態の Cookie と、保存した接続元と同じ右端のときだけ', async () => {
    await fc.assert(fc.asyncProperty(cookie, forwardedFor, userAgent, async (c, f, u) => {
      vi.mocked(notifySlackFireAndForget).mockClear()
      vi.mocked(finalizePhoneMfa).mockClear()
      throttle.clear(); pendings.clear()
      await pendings.save(PENDING_ID, {
        email: 'pc1@example.com', ip: SAVED_IP, mfaPendingCredential: 'cred', sessionInfo: 's', phoneHint: '', expiresAtMs: Date.now() + 300_000,
      })
      const res = await VERIFY(request('http://localhost/api/auth/login/verify', { code: '123456' }, { cookie: c, forwardedFor: f, userAgent: u }))
      expect([200, 401, 403]).toContain(res.status)
      expect(slackKinds().every((k) => k === 'ログイン拒否' || k === 'ログイン')).toBe(true)

      // Cookie の先頭の mfa_pending の値が本物で、右端の接続元が保存したものと同じときだけ Firebase に送る
      const sent = (c ?? '').split(';').map((s) => s.trim()).find((s) => s.startsWith('mfa_pending='))?.slice('mfa_pending='.length)
      const ip = forwardedIps(f).at(-1) ?? null
      const shouldFinalize = sent === PENDING_ID && ip === SAVED_IP
      expect(vi.mocked(finalizePhoneMfa).mock.calls.length).toBe(shouldFinalize ? 1 : 0)
      if (res.status === 200) expect(shouldFinalize).toBe(true)
      if (shouldFinalize) finalized++
    }), { numRuns: 500 })
    // Firebase に送る組（本物の Cookie・同じ接続元）を十分に試したこと
    expect(finalized).toBeGreaterThan(20)
  })
})
