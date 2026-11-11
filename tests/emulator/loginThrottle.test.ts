// @vitest-environment node
// ログインの失敗回数の制限を、本物の Auth Emulator（パスワードの確認）と Firestore Emulator（回数）で確かめる
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { firestoreLoginThrottleRepository, throttleDocId } from '@/infra/auth/firestoreLoginThrottleRepository'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

const RUN_ID = `emutest-throttle-${Date.now()}`
const PASSWORD = 'emutest-password'
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const createdUids: string[] = []
let ipSeq = 0

async function createUser(): Promise<string> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  const user = await adminAuth.createUser({ email, password: PASSWORD })
  createdUids.push(user.uid)
  return email
}

const login = (email: string, password: string, ip: string) => LOGIN(new Request('http://localhost/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME, 'x-forwarded-for': ip },
  body: JSON.stringify({ email, password }),
}))
// テストごとに別の IP（IP の回数がほかのテストに残らないように）
const nextIp = () => `198.51.100.${++ipSeq}`
const clearThrottle = () => adminDb.recursiveDelete(adminDb.collection('loginThrottle'))

beforeAll(async () => {
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  await clearThrottle()
})
beforeEach(() => vi.mocked(notifySlackFireAndForget).mockClear())
afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
  await clearThrottle()
})

describe('ログインの失敗回数の制限（本物の REST と Firestore）', () => {
  it('正しいパスワードなら 200 と Cookie', async () => {
    const email = await createUser()
    const res = await login(email, PASSWORD, nextIp())
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('session=')
  })

  it('間違いが3回で 429。正しいパスワードでも止まる。回数はメールアドレスのハッシュの ID で残る', async () => {
    const email = await createUser()
    const ip = nextIp()
    for (let i = 0; i < 3; i++) expect((await login(email, 'wrong-password', ip)).status).toBe(401)
    const locked = await login(email, PASSWORD, ip)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)

    const doc = await adminDb.collection('loginThrottle').doc(throttleDocId({ kind: 'email', value: email })).get()
    expect(doc.data()?.failures).toBe(3)
    // 生のメールアドレスは ID にも中身にも置かない
    expect(doc.id).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(doc.data())).not.toContain(email)
  })

  it('存在しないメールアドレスも、同じ 401 で同じように数える', async () => {
    const ip = nextIp()
    const email = `${RUN_ID}-nobody@example.com`
    for (let i = 0; i < 3; i++) {
      const res = await login(email, 'xxx', ip)
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'invalid_credentials' })
    }
    expect((await login(email, 'xxx', ip)).status).toBe(429)
  })

  it('成功で数え直す', async () => {
    const email = await createUser()
    const ip = nextIp()
    for (let i = 0; i < 2; i++) await login(email, 'wrong-password', ip)
    expect((await login(email, PASSWORD, ip)).status).toBe(200)
    const [state] = await firestoreLoginThrottleRepository.read([{ kind: 'email', value: email }])
    expect(state).toBeNull()
  })

  // 確認と記録を1つのトランザクションで行うので、同時に試しても止める前の3回しか通らない（すり抜けない）
  it('同時に10回試しても、通るのは3回で、回数は3（トランザクション）', async () => {
    const key = { kind: 'email' as const, value: `${RUN_ID}-concurrent@example.com` }
    const now = Date.now()
    const results = await Promise.all(Array.from({ length: 10 }, () => firestoreLoginThrottleRepository.acquire([key], now)))
    expect(results.filter((r) => r.success)).toHaveLength(3)
    const [state] = await firestoreLoginThrottleRepository.read([key])
    expect(state?.failures).toBe(3)
  })

  it('同時に10回、本物のログイン API で間違えても、Firebase まで届くのは3回（残りは 429）', async () => {
    const email = await createUser()
    const ip = nextIp()
    const statuses = await Promise.all(Array.from({ length: 10 }, () => login(email, 'wrong-password', ip).then((r) => r.status)))
    expect(statuses.filter((s) => s === 401)).toHaveLength(3)
    expect(statuses.filter((s) => s === 429)).toHaveLength(7)
  })

  it('先に数えた1回は、障害のときに返せる（refund）', async () => {
    const key = { kind: 'ip' as const, value: nextIp() }
    const t0 = Date.now()
    for (let i = 0; i < 2; i++) await firestoreLoginThrottleRepository.acquire([key], t0 + i)
    const third = await firestoreLoginThrottleRepository.acquire([key], t0 + 2) // 3回目で止まるはず
    if (!third.success) throw new Error('3回目は通るはず')
    await firestoreLoginThrottleRepository.refund([key], third.value, t0 + 2)
    const [state] = await firestoreLoginThrottleRepository.read([key])
    // 3回目を数える前の状態に戻る（最後の失敗の時刻も2回目のまま、止めない）
    expect(state).toEqual({ failures: 2, lastFailureAtMs: t0 + 1, lockedUntilMs: 0 })
  })

  it('形の崩れたドキュメントは、なかったものとして扱う（止めず、次の失敗で書き直す）', async () => {
    const key = { kind: 'ip' as const, value: nextIp() }
    await adminDb.collection('loginThrottle').doc(throttleDocId(key)).set({ failures: 'many', lockedUntil: 'forever' })
    expect(await firestoreLoginThrottleRepository.read([key])).toEqual([null])
    expect((await firestoreLoginThrottleRepository.acquire([key], Date.now())).success).toBe(true)
    expect((await firestoreLoginThrottleRepository.read([key]))[0]?.failures).toBe(1)
  })
})
