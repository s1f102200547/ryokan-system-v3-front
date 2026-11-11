// セッションの失効: 失効させたら、ブラウザに Cookie が残っていても次の API から使えないこと。
// Auth Emulator で本物のユーザーを作り、本物のログイン API で Session Cookie を受け取り、その Cookie で API を呼ぶ。
// verifySession は mock しない（失効の確認まで本物を通す）。
// 注意: firebase-admin は Emulator に接続しているとき、checkRevoked の指定に関係なく失効を確かめる。
// そのため verifySessionCookie に true を渡し忘れても、このテストは落ちない。それは tests/unit/lib/verifySession.test.ts が見る
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { adminAuth } from '@/lib/firebase/admin'
import { getTodayJST } from '@/lib/dateUtils'
import { parseCookieValue } from '@/lib/api/routeHelpers'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { GET as GUEST_INFO } from '@/app/api/guest-info/route'

// ログインはWindowsの Chrome・Edge だけ（src/lib/auth/clientCheck.ts）
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const RUN_ID = `emutest-revoke-${Date.now()}`
const PASSWORD = 'emutest-password'
const AUTH_URL = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`
const createdUids: string[] = []

// firebase-admin は失効の時刻（秒に切り捨て）とログインの時刻（秒）を「より前か」で比べるので、
// ログインと同じ秒の revokeRefreshTokens は効かない（仕様）。運用の失効はログインから十分あとなので、秒をまたがせてから失効させる。
// 要件は「失効から数秒以内に使えなくなる」こと。ここでは失効の直後の API で確かめる
const nextSecond = () => new Promise((r) => setTimeout(r, 1100))

async function authRest(method: 'accounts:signUp' | 'accounts:signInWithPassword', email: string) {
  const res = await fetch(`${AUTH_URL}/${method}?key=demo-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  })
  const body = (await res.json()) as { idToken?: string; localId?: string }
  if (!res.ok || !body.idToken || !body.localId) throw new Error(`${method} に失敗: ${res.status}`)
  return { idToken: body.idToken, uid: body.localId }
}

async function createUser(label: string) {
  const email = `${RUN_ID}-${label}-${createdUids.length}@example.com`
  const { uid } = await authRest('accounts:signUp', email)
  createdUids.push(uid)
  return { email, uid }
}

// 本物のログイン API で Session Cookie を受け取る
async function login(email: string): Promise<string> {
  const { idToken } = await authRest('accounts:signInWithPassword', email)
  const res = await LOGIN(new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME }, body: JSON.stringify({ idToken }),
  }))
  expect(res.status).toBe(200)
  const cookie = parseCookieValue(res.headers.get('set-cookie')?.split(';')[0] ?? null, 'session')
  if (!cookie) throw new Error('Session Cookie がない')
  return cookie
}

async function guestInfo(cookie: string): Promise<number> {
  const res = await GUEST_INFO(new Request(`http://localhost/api/guest-info?date=${getTodayJST()}`, {
    headers: { cookie: `session=${cookie}` },
  }))
  return res.status
}

beforeAll(() => {
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
})

afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
})

describe('Session Cookie の失効', () => {
  it('ログインで受け取った Cookie で API を呼べる（前提）', async () => {
    const { email } = await createUser('valid')
    expect(await guestInfo(await login(email))).toBe(200)
  })

  it.each([
    ['revokeRefreshTokens', (uid: string) => adminAuth.revokeRefreshTokens(uid)],
    ['ユーザーの無効化', (uid: string) => adminAuth.updateUser(uid, { disabled: true }).then(() => undefined)],
    ['ユーザーの削除', (uid: string) => adminAuth.deleteUser(uid)],
  ])('%s のあと、同じ Cookie は 401', async (_label, revoke) => {
    const { email, uid } = await createUser('revoke')
    const cookie = await login(email)
    expect(await guestInfo(cookie)).toBe(200)

    await nextSecond()
    await revoke(uid)

    expect(await guestInfo(cookie)).toBe(401)
  })

  it('失効のあとにログインし直せば、新しい Cookie は使える', async () => {
    const { email, uid } = await createUser('relogin')
    const oldCookie = await login(email)
    await nextSecond()
    await adminAuth.revokeRefreshTokens(uid)
    await nextSecond()

    const newCookie = await login(email)
    expect(await guestInfo(newCookie)).toBe(200)
    expect(await guestInfo(oldCookie)).toBe(401)
  })
})
