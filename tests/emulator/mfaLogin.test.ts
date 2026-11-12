// @vitest-environment node
// SMS の2要素目のログインを、本物の Auth Emulator（パスワード・SMS・コード）と Firestore Emulator（回数・途中の状態）で通す
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { createMfaUser, loginWithMfa, startLogin, verifyCode } from '@tests/utils/emulatorMfa'
import { POST as LOGIN } from '@/app/api/auth/login/route'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

const RUN_ID = `emutest-mfa-${Date.now()}`
const PASSWORD = 'emutest-password'
const createdUids: string[] = []
let ipSeq = 0
const nextIp = () => `192.0.2.${++ipSeq}`

async function createUser(enrolled = true): Promise<string> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  const uid = enrolled ? await createMfaUser(email, PASSWORD) : (await adminAuth.createUser({ email, password: PASSWORD })).uid
  createdUids.push(uid)
  return email
}
const clear = async () => {
  for (const c of ['loginThrottle', 'mfaPending', 'mfaSmsQuota']) await adminDb.recursiveDelete(adminDb.collection(c))
}

beforeAll(async () => {
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  await clear()
})
beforeEach(() => { vi.mocked(notifySlackFireAndForget).mockClear() })
afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
  await clear()
})

describe('SMS の2要素目（本物の REST）', () => {
  it('パスワード → SMS のコード → Session Cookie。Cookie のトークンは2要素目を通っている', async () => {
    const email = await createUser()
    const ip = nextIp()
    const started = await startLogin(email, PASSWORD, { forwardedFor: ip })
    expect(started.res.status).toBe(200)
    expect(await started.res.json()).toEqual({ mfaRequired: true, phoneHint: expect.stringMatching(/0100$/) })
    expect(started.res.headers.get('set-cookie')).not.toContain('session=')

    const res = await verifyCode(started.pendingId!, started.code!, { forwardedFor: ip })
    expect(res.status).toBe(200)
    const session = res.cookies.get('session')?.value ?? ''
    const decoded = await adminAuth.verifySessionCookie(session, true)
    expect(decoded.firebase.sign_in_second_factor).toBe('phone')
    expect(await firestoreMfaPendingRepository.get(started.pendingId!)).toBeNull()
  })

  it('違うコードは 401 invalid_code、正しいコードで入れる。成功で失敗の回数を 0 に戻す', async () => {
    const email = await createUser()
    const ip = nextIp()
    const started = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const wrong = started.code === '000000' ? '111111' : '000000'
    const res = await verifyCode(started.pendingId!, wrong, { forwardedFor: ip })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
    const [counted] = await firestoreLoginThrottleRepository.read([{ kind: 'email', value: email }])
    expect(counted?.failures).toBe(1)

    expect((await verifyCode(started.pendingId!, started.code!, { forwardedFor: ip })).status).toBe(200)
    const [state] = await firestoreLoginThrottleRepository.read([{ kind: 'email', value: email }])
    expect(state).toBeNull()
  })

  it('コードを3回間違えると止まり、正しいパスワードでも SMS を送らない', async () => {
    const email = await createUser()
    const ip = nextIp()
    const started = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const wrong = started.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 3; i++) expect((await verifyCode(started.pendingId!, wrong, { forwardedFor: ip })).status).toBe(401)
    expect((await verifyCode(started.pendingId!, started.code!, { forwardedFor: ip })).status).toBe(429)
    expect((await startLogin(email, PASSWORD, { forwardedFor: ip })).res.status).toBe(429)
  })

  it('電話を登録していないアカウントは 403 mfa_not_enrolled（Cookie なし）', async () => {
    const email = await createUser(false)
    const res = await LOGIN(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' },
      body: JSON.stringify({ email, password: PASSWORD }),
    }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'mfa_not_enrolled' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('コードを別の回線から送ると 401 mfa_expired（途中の状態を消す）', async () => {
    const email = await createUser()
    const started = await startLogin(email, PASSWORD, { forwardedFor: nextIp() })
    expect((await verifyCode(started.pendingId!, started.code!, { forwardedFor: nextIp() })).status).toBe(401)
    expect(await firestoreMfaPendingRepository.get(started.pendingId!)).toBeNull()
  })

  it('一度使った途中の状態は使えない', async () => {
    const email = await createUser()
    const ip = nextIp()
    const started = await startLogin(email, PASSWORD, { forwardedFor: ip })
    expect((await verifyCode(started.pendingId!, started.code!, { forwardedFor: ip })).status).toBe(200)
    expect(await (await verifyCode(started.pendingId!, started.code!, { forwardedFor: ip })).json()).toEqual({ error: 'mfa_expired' })
  })

  it('loginWithMfa（ほかのテストの道具）で入れる', async () => {
    const email = await createUser()
    expect((await loginWithMfa(email, PASSWORD, { forwardedFor: nextIp() })).status).toBe(200)
  })
})
