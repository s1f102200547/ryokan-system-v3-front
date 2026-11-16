// @vitest-environment node
// SMS の2要素目のセキュリティテスト（docs/MfaBugHunt.md の S12）。本物の Auth Emulator と Firestore Emulator で、
// ログインの手順を飛ばす・取り違える使い方を、この API が断ること
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { createMfaUser, startLogin, verifyCode, WINDOWS_CHROME } from '@tests/utils/emulatorMfa'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { POST as VERIFY } from '@/app/api/auth/login/verify/route'
import { GET as GUEST_INFO } from '@/app/api/guest-info/route'
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

const RUN_ID = `emutest-mfasec-${Date.now()}`
const PASSWORD = 'emutest-password'
const createdUids: string[] = []
let ipSeq = 0
const nextIp = () => `192.0.2.${200 + ++ipSeq}`

async function createUser(enrolled = true): Promise<string> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  const uid = enrolled ? await createMfaUser(email, PASSWORD) : (await adminAuth.createUser({ email, password: PASSWORD })).uid
  createdUids.push(uid)
  if (!enrolled) await new Promise((r) => setTimeout(r, 1100)) // tokensValidAfterTime（tests/utils/emulatorMfa.ts）
  return email
}
const clear = async () => {
  for (const c of ['loginThrottle', 'mfaPending', 'mfaSmsQuota']) await adminDb.recursiveDelete(adminDb.collection(c))
}
const loginRequest = (email: string, password: string, ip: string) => LOGIN(new Request('http://localhost/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': WINDOWS_CHROME, 'x-forwarded-for': ip },
  body: JSON.stringify({ email, password }),
}))
const guestInfo = (cookie: string) => GUEST_INFO(new Request('http://localhost/api/guest-info?date=2026-05-20', { headers: { cookie } }))

beforeAll(async () => {
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  await clear()
})
beforeEach(() => { vi.mocked(notifySlackFireAndForget).mockClear() })
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
  await clear()
})

describe('パスワードの段を飛ばす', () => {
  it.each([
    ['作った ID', 'A'.repeat(43)],
    ['空', ''],
    ['ほかの Cookie の名前の値', 'session'],
  ])('途中の状態の Cookie を作って（%s）コードを送っても 401 mfa_expired。Firestore に何も残さない', async (_label, forged) => {
    const res = await VERIFY(new Request('http://localhost/api/auth/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin', 'user-agent': WINDOWS_CHROME, 'x-forwarded-for': nextIp(), cookie: `mfa_pending=${forged}` },
      body: JSON.stringify({ code: '123456' }),
    }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'mfa_expired' })
    expect(res.cookies.get('session')).toBeUndefined()
    expect((await adminDb.collection('mfaPending').get()).size).toBe(0)
  })
})

describe('アカウントがあるかを探らせない', () => {
  it('存在しないメールアドレスと、間違ったパスワードは、同じ status・同じ本文（401 invalid_credentials）。どちらも数える', async () => {
    const email = await createUser()
    const [ipA, ipB] = [nextIp(), nextIp()]
    const wrongPassword = await loginRequest(email, 'wrong-password', ipA)
    const unknownEmail = await loginRequest(`${RUN_ID}-nobody@example.com`, 'wrong-password', ipB)
    expect([wrongPassword.status, unknownEmail.status]).toEqual([401, 401])
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json())
    expect(wrongPassword.headers.get('set-cookie')).toBeNull()
    expect(unknownEmail.headers.get('set-cookie')).toBeNull()
    // 応答の時間がそろうかは Emulator では測れない（本番の Identity Platform の応答の時間による。S17）
  })

  it('電話を登録したアカウントの、正しいパスワードの応答に、電話番号は伏せ字でしか載らない', async () => {
    const email = await createUser()
    const res = await loginRequest(email, PASSWORD, nextIp())
    const body = await res.json() as { phoneHint: string }
    expect(body.phoneHint).not.toMatch(/\d{5,}/)
    expect(JSON.stringify(body)).not.toContain('5555550100')
  })
})

describe('途中の状態の Cookie は、ログインの代わりにならない', () => {
  it('パスワードを通しただけの途中の状態の ID は、ほかの API で Session Cookie として使えない（401）', async () => {
    const email = await createUser()
    const started = await startLogin(email, PASSWORD, { forwardedFor: nextIp() })
    expect((await guestInfo(`mfa_pending=${started.pendingId}`)).status).toBe(401)
    expect((await guestInfo(`session=${started.pendingId}`)).status).toBe(401)
  })

  it('別のアカウントのパスワードで作った途中の状態で、そのアカウントにしか入れない（コードを取り違えても入れない）', async () => {
    const a = await createUser()
    const b = await createUser()
    const ip = nextIp()
    const sa = await startLogin(a, PASSWORD, { forwardedFor: ip })
    const sb = await startLogin(b, PASSWORD, { forwardedFor: ip })
    if (sa.code === sb.code) return // たまたま同じ6桁
    const res = await verifyCode(sa.pendingId!, sb.code!, { forwardedFor: ip })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_code' })
  })
})

describe('MFA_MODE を enrolled_only から all に戻したとき', () => {
  // [F-18] enrolled_only の間にパスワードだけで受け取った Session Cookie は、all に戻した時点で使えなくなる
  // （verifySession が all のときは2要素目を通ったかを見る）。enrolled_only の間は使える
  it('[F-18] enrolled_only で出した SMS なしの Session Cookie は、enrolled_only の間は通り、all に戻すと未ログイン', async () => {
    vi.stubEnv('MFA_MODE', 'enrolled_only')
    const email = await createUser(false)
    const res = await loginRequest(email, PASSWORD, nextIp())
    expect(res.status).toBe(200)
    const session = res.cookies.get('session')?.value ?? ''

    expect(await verifySession(session)).not.toBeNull()
    vi.stubEnv('MFA_MODE', 'all')
    expect(await verifySession(session)).toBeNull()
    const decoded = await adminAuth.verifySessionCookie(session, true)
    expect(decoded.firebase.sign_in_second_factor).toBeUndefined()
  })
})
