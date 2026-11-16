// @vitest-environment node
// SMS の2要素目のサーバーの状態遷移（docs/MfaBugHunt.md の S8）。本物の Auth Emulator と Firestore Emulator で:
// 途中の状態の使い回し・同時の確認、パスワードを2回通したときの古い Cookie、同じ IP の別アカウント（旅館の PC は同じ回線）、
// enrolled_only で電話を外したアカウント、同じアカウントへの2台からのログイン
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { appendFileSync } from 'node:fs'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { createMfaUser, startLogin, verifyCode, WINDOWS_CHROME } from '@tests/utils/emulatorMfa'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

const RUN_ID = `emutest-mfast-${Date.now()}`
const PASSWORD = 'emutest-password'
const createdUids: string[] = []
let ipSeq = 0
const nextIp = () => `192.0.2.${100 + ++ipSeq}`
// 仕様が決まっていない遷移の、今の結果を残す（PROBE_OUT があるときだけ。記録 docs/MfaBugHuntFindings.md に写す）
const probe = (...a: unknown[]) => { if (process.env.PROBE_OUT) appendFileSync(process.env.PROBE_OUT, `${a.map(String).join(' ')}\n`) }

async function createUser(): Promise<{ email: string; uid: string }> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  const uid = await createMfaUser(email, PASSWORD)
  createdUids.push(uid)
  return { email, uid }
}
const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000')
const failuresOf = async (key: { kind: 'email' | 'ip'; value: string }) => (await firestoreLoginThrottleRepository.read([key]))[0]?.failures ?? 0
const clear = async () => {
  for (const c of ['loginThrottle', 'mfaPending', 'mfaSmsQuota']) await adminDb.recursiveDelete(adminDb.collection(c))
}

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

describe('途中の状態の使い回し', () => {
  // 画面が同じコードを2回送った（F-12）とき。Session Cookie を出すのは1回だけ
  it('同じ Cookie・同じコードで同時に2回確かめても、Session Cookie を出すのは1回', async () => {
    const { email } = await createUser()
    const ip = nextIp()
    const started = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const [a, b] = await Promise.all([
      verifyCode(started.pendingId!, started.code!, { forwardedFor: ip }),
      verifyCode(started.pendingId!, started.code!, { forwardedFor: ip }),
    ])
    const results = await Promise.all([a, b].map(async (r) => ({ status: r.status, body: await r.json(), session: r.cookies.get('session')?.value })))
    probe('S8-1 同時の verify:', JSON.stringify(results.map((r) => ({ status: r.status, body: r.body }))))
    expect(results.filter((r) => r.session).length).toBe(1)
  })

  it('パスワードを2回通したら（再送）、1回目の Cookie とコードはどうなるか', async () => {
    const { email } = await createUser()
    const ip = nextIp()
    const first = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const second = await startLogin(email, PASSWORD, { forwardedFor: ip })
    expect(first.pendingId).not.toBe(second.pendingId)
    // 1回目の途中の状態は、期限（5分）まで残る
    expect(await firestoreMfaPendingRepository.get(first.pendingId!)).not.toBeNull()

    const oldCookieNewCode = await verifyCode(first.pendingId!, second.code!, { forwardedFor: ip })
    probe('S8-2a 1回目の Cookie + 2回目のコード:', oldCookieNewCode.status, JSON.stringify(await oldCookieNewCode.json()))
    const oldCookieOldCode = await verifyCode(first.pendingId!, first.code!, { forwardedFor: ip })
    probe('S8-2b 1回目の Cookie + 1回目のコード:', oldCookieOldCode.status, JSON.stringify(await oldCookieOldCode.json()))
    const newCookieNewCode = await verifyCode(second.pendingId!, second.code!, { forwardedFor: ip })
    probe('S8-2c 2回目の Cookie + 2回目のコード:', newCookieNewCode.status)
    // 今の2回目の確認は、決まった動きがない（記録 F-14）。少なくとも、合わないコードは数え、SMS の段を飛ばさない
    expect(oldCookieNewCode.status).toBe(401)
  })

  // SMS が遅れて「再送」を押し、先に1通目が届いた。ブラウザの Cookie は2回目のもの。利用者は届いた1通目のコードを打つ
  it('再送の後に、1通目の SMS のコードを打つと 401 invalid_code になり、失敗として数える', async () => {
    const { email } = await createUser()
    const ip = nextIp()
    const first = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const second = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const res = await verifyCode(second.pendingId!, first.code!, { forwardedFor: ip })
    probe('S8-2d 2回目の Cookie + 1回目のコード:', res.status, JSON.stringify(await res.json()), 'same code?', first.code === second.code)
    if (first.code === second.code) return // たまたま同じ6桁（100万分の1）
    expect(res.status).toBe(401)
    expect(await failuresOf({ kind: 'email', value: email })).toBe(1)
  })
})

describe('同じ IP（旅館の回線）の別アカウント', () => {
  it('PC1 のアカウントがコードを3回間違えると、同じ回線の PC2 のアカウントも、正しいパスワードで 429 になる', async () => {
    const pc1 = await createUser()
    const pc2 = await createUser()
    const ip = nextIp()
    const started = await startLogin(pc1.email, PASSWORD, { forwardedFor: ip })
    for (let i = 0; i < 3; i++) expect((await verifyCode(started.pendingId!, wrongOf(started.code!), { forwardedFor: ip })).status).toBe(401)

    const pc2Login = await startLogin(pc2.email, PASSWORD, { forwardedFor: ip })
    expect(pc2Login.res.status).toBe(429)
    expect(await failuresOf({ kind: 'email', value: pc2.email })).toBe(0) // PC2 のアカウントは何も間違えていない
    // 別の回線からなら入れる
    expect((await startLogin(pc2.email, PASSWORD, { forwardedFor: nextIp() })).res.status).toBe(200)
  })

  it('PC2 のアカウントがコードを通すと、同じ回線の IP の回数は 0 に戻る（PC1 のアカウントの回数は残る）', async () => {
    const pc1 = await createUser()
    const pc2 = await createUser()
    const ip = nextIp()
    const s1 = await startLogin(pc1.email, PASSWORD, { forwardedFor: ip })
    for (let i = 0; i < 2; i++) await verifyCode(s1.pendingId!, wrongOf(s1.code!), { forwardedFor: ip })
    expect(await failuresOf({ kind: 'ip', value: ip })).toBe(2)

    const s2 = await startLogin(pc2.email, PASSWORD, { forwardedFor: ip })
    expect((await verifyCode(s2.pendingId!, s2.code!, { forwardedFor: ip })).status).toBe(200)
    expect(await failuresOf({ kind: 'ip', value: ip })).toBe(0)
    expect(await failuresOf({ kind: 'email', value: pc1.email })).toBe(2)
  })

  it('PC1 と PC2 が同じ回線で同時にログインしても、両方とも入れる（試行中の札で待つことはある）', async () => {
    const pc1 = await createUser()
    const pc2 = await createUser()
    const ip = nextIp()
    const [s1, s2] = await Promise.all([startLogin(pc1.email, PASSWORD, { forwardedFor: ip }), startLogin(pc2.email, PASSWORD, { forwardedFor: ip })])
    expect([s1.res.status, s2.res.status]).toEqual([200, 200])
    const [v1, v2] = await Promise.all([verifyCode(s1.pendingId!, s1.code!, { forwardedFor: ip }), verifyCode(s2.pendingId!, s2.code!, { forwardedFor: ip })])
    expect([v1.status, v2.status]).toEqual([200, 200])
  })
})

describe('同じアカウントに2台から', () => {
  it('両方の PC がコードを通せる。後から通した方のセッションだけが残る（1アカウント1セッション）', async () => {
    const { email } = await createUser()
    const ip = nextIp()
    const a = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const b = await startLogin(email, PASSWORD, { forwardedFor: ip })
    const va = await verifyCode(a.pendingId!, a.code!, { forwardedFor: ip })
    await new Promise((r) => setTimeout(r, 1100)) // auth_time は秒。同じ秒だと区別できない
    const vb = await verifyCode(b.pendingId!, b.code!, { forwardedFor: ip })
    expect([va.status, vb.status]).toEqual([200, 200])
    expect(await verifySession(va.cookies.get('session')?.value)).toBeNull()
    expect(await verifySession(vb.cookies.get('session')?.value)).not.toBeNull()
  })
})

describe('enrolled_only で電話を外したアカウント（F-04）', () => {
  const passwordLogin = (email: string) => LOGIN(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME, 'x-forwarded-for': nextIp() },
    body: JSON.stringify({ email, password: PASSWORD }),
  }))

  it.each([
    ['enrolled_only', 200, { success: true }],
    ['all', 403, { error: 'mfa_not_enrolled' }],
  ] as const)('MFA_MODE=%s: 登録を外す（scripts/mfa/enrollPhone.ts の --remove と同じ）と → %i', async (mode, status, body) => {
    vi.stubEnv('MFA_MODE', mode)
    const { email, uid } = await createUser()
    await adminAuth.updateUser(uid, { multiFactor: { enrolledFactors: null } })
    await new Promise((r) => setTimeout(r, 1100)) // 更新で tokensValidAfterTime が変わることがある
    const res = await passwordLogin(email)
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual(body)
  })
})
