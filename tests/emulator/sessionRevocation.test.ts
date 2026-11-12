// セッションの失効: 失効させたら、ブラウザに Cookie が残っていても次の API から使えないこと。
// Auth Emulator で本物のユーザーを作り、本物のログイン API で Session Cookie を受け取り、その Cookie で API を呼ぶ。
// verifySession は mock しない（失効の確認まで本物を通す）。
// 注意: firebase-admin は Emulator に接続しているとき、checkRevoked の指定に関係なく失効を確かめる。
// そのため verifySessionCookie に true を渡し忘れても、このテストは落ちない。それは tests/unit/lib/verifySession.test.ts が見る
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { adminAuth } from '@/lib/firebase/admin'
import { getTodayJST } from '@/lib/dateUtils'
import { parseCookieValue } from '@/lib/api/routeHelpers'
import { createMfaUser, loginWithMfa } from '@tests/utils/emulatorMfa'
import { GET as GUEST_INFO } from '@/app/api/guest-info/route'
import { logger } from '@/lib/logger'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const RUN_ID = `emutest-revoke-${Date.now()}`
const PASSWORD = 'emutest-password'
const createdUids: string[] = []

// firebase-admin は失効の時刻（秒に切り捨て）とログインの時刻（秒）を「より前か」で比べるので、
// ログインと同じ秒の revokeRefreshTokens は効かない（仕様）。運用の失効はログインから十分あとなので、秒をまたがせてから失効させる。
// 要件は「失効から数秒以内に使えなくなる」こと。ここでは失効の直後の API で確かめる
const nextSecond = () => new Promise((r) => setTimeout(r, 1100))

async function createUser(label: string) {
  const email = `${RUN_ID}-${label}-${createdUids.length}@example.com`
  const uid = await createMfaUser(email, PASSWORD) // ログインには SMS の2要素目が要る
  createdUids.push(uid)
  // Emulator はユーザーを作った秒を tokensValidAfterTime にする。WSL の時計は1秒近く戻ることがあり（2026-11-12 に Date.now が
  // 約 0.7 秒戻るのを観察）、直後のログインの auth_time がそれより前になると auth/id-token-revoked で落ちる。作った秒をまたいでからログインする
  await nextSecond()
  return { email, uid }
}

// 本物のログイン API（パスワード・SMS・コードの確認は Auth Emulator の REST）で Session Cookie を受け取る
async function login(email: string): Promise<string> {
  const res = await loginWithMfa(email, PASSWORD)
  // 落ちたときは、応答と、ログイン API が残した直近のログ（失敗の理由のコード）を載せる
  const message = res.status === 200 ? undefined : JSON.stringify({
    nowMs: Date.now(),
    response: { status: res.status, body: await res.clone().text() },
    logs: [...vi.mocked(logger.warn).mock.calls, ...vi.mocked(logger.error).mock.calls].slice(-3),
  }, null, 2)
  expect(res.status, message).toBe(200)
  const cookie = parseCookieValue(res.headers.get('set-cookie')?.split(';')[0] ?? null, 'session')
  if (!cookie) throw new Error('Session Cookie がない')
  return cookie
}

async function guestInfo(cookie: string): Promise<Response> {
  return GUEST_INFO(new Request(`http://localhost/api/guest-info?date=${getTodayJST()}`, {
    headers: { cookie: `session=${cookie}` },
  }))
}

// 時刻の比べ方（秒単位）に関わる値。まれに落ちたことがあり（2026-11-11、約30回に2回）、原因を追えるよう、落ちたときだけ集めて載せる
async function diagnose(cookie: string, res: Response): Promise<string> {
  const settle = <T>(p: Promise<T>) => p.then((v) => v, (e: unknown) => `例外: ${e instanceof Error ? e.message : String(e)}`)
  const decoded = await settle(adminAuth.verifySessionCookie(cookie, false))
  const user = typeof decoded === 'string' ? decoded : await settle(adminAuth.getUser(decoded.uid))
  return JSON.stringify({
    nowMs: Date.now(),
    response: { status: res.status, body: await res.clone().text() },
    cookie: typeof decoded === 'string' ? decoded : { uid: decoded.uid, auth_time: decoded.auth_time, iat: decoded.iat, exp: decoded.exp },
    user: typeof user === 'string' ? user : {
      tokensValidAfterMs: user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : null,
      customClaims: user.customClaims ?? null,
      disabled: user.disabled,
    },
  }, null, 2)
}

// guest-info を呼び、status が違えば diagnose の結果を失敗のメッセージに載せる
async function expectStatus(cookie: string, expected: number) {
  const res = await guestInfo(cookie)
  const message = res.status === expected ? undefined : await diagnose(cookie, res)
  expect(res.status, message).toBe(expected)
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
    await expectStatus(await login(email), 200)
  })

  it.each([
    ['revokeRefreshTokens', (uid: string) => adminAuth.revokeRefreshTokens(uid)],
    ['ユーザーの無効化', (uid: string) => adminAuth.updateUser(uid, { disabled: true }).then(() => undefined)],
    ['ユーザーの削除', (uid: string) => adminAuth.deleteUser(uid)],
  ])('%s のあと、同じ Cookie は 401', async (_label, revoke) => {
    const { email, uid } = await createUser('revoke')
    const cookie = await login(email)
    await expectStatus(cookie, 200)

    await nextSecond()
    await revoke(uid)

    await expectStatus(cookie, 401)
  })

  it('失効のあとにログインし直せば、新しい Cookie は使える', async () => {
    const { email, uid } = await createUser('relogin')
    const oldCookie = await login(email)
    await nextSecond()
    await adminAuth.revokeRefreshTokens(uid)
    await nextSecond()

    const newCookie = await login(email)
    await expectStatus(newCookie, 200)
    await expectStatus(oldCookie, 401)
  })
})

// 1アカウント1セッション（ログイン API がクレームに最後のログインの時刻を書き、verifySession が比べる）
describe('1アカウント1セッション', () => {
  it('同じアカウントで新しくログインすると、前の Cookie は 401、新しい Cookie は使える', async () => {
    const { email, uid } = await createUser('single')
    const first = await login(email)
    await expectStatus(first, 200)

    await nextSecond() // ログインの時刻（auth_time）は秒単位。同じ秒の2回のログインは両方とも通る
    const second = await login(email)

    await expectStatus(first, 401)
    await expectStatus(second, 200)
    expect((await adminAuth.getUser(uid)).customClaims).toEqual({ sessionAuthTime: expect.any(Number) })
  })

  it('別のアカウントのログインでは切れない', async () => {
    const a = await createUser('single-a')
    const b = await createUser('single-b')
    const cookieA = await login(a.email)
    await nextSecond()
    await login(b.email)
    await expectStatus(cookieA, 200)
  })

  it('クレームを消すと（この仕組みの前のログインと同じ）、その Cookie は 401', async () => {
    const { email, uid } = await createUser('single-noclaim')
    const cookie = await login(email)
    await adminAuth.setCustomUserClaims(uid, null)
    await expectStatus(cookie, 401)
  })
})

