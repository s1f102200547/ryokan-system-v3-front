// @vitest-environment node
// ログインの時間と、同じ回線（同じ IP）の PC が同時にログインしたときの通り方（docs/MfaBugHunt.md の S13）。合否は判定しない。
// 本物の Auth Emulator・Firestore Emulator を使い、Identity Toolkit への通信に遅れを足して本番に近づける
// （Emulator は数十 ms で返すが、本番はパスワードの確認・SMS の送信・コードの確認に数百 ms〜1秒かかる）。
// 画面と同じく、429 attempt_in_progress には待って送り直す（src/hooks/auth/useLogin.ts の postWithBusyRetry: 最大5回、1回3秒まで）。
// 結果: perf-results/mfa-<PERF_LABEL>.json と、標準出力の表
import { describe, it, vi, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { firestoreLoginThrottleRepository } from '@/infra/auth/firestoreLoginThrottleRepository'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { createMfaUser, readEmulatorSmsCode, WINDOWS_CHROME } from '@tests/utils/emulatorMfa'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { POST as VERIFY } from '@/app/api/auth/login/verify/route'

vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const RUN_ID = `emutest-perf-${Date.now()}`
const PASSWORD = 'emutest-password'
const LABEL = process.env.PERF_LABEL ?? 'mfa'
const RUNS = Number(process.env.PERF_RUNS ?? 10)
const createdUids: string[] = []
let ipSeq = 0
const nextIp = () => `198.18.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Identity Toolkit への通信だけに遅れを足す（Emulator の SMS のコードを読む REST は対象外）
let identityToolkitDelayMs = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  if (String(input instanceof Request ? input.url : input).includes('/identitytoolkit.googleapis.com/')) await sleep(identityToolkitDelayMs)
  return realFetch(input, init)
}) as typeof fetch

async function createUsers(n: number): Promise<string[]> {
  const emails = Array.from({ length: n }, (_, i) => `${RUN_ID}-${createdUids.length + i}@example.com`)
  const uids = await Promise.all(emails.map((e) => createMfaUser(e, PASSWORD)))
  createdUids.push(...uids)
  return emails
}

// 画面と同じ自動の送り直し（useLogin の postWithBusyRetry）
async function postWithBusyRetry<R extends Response>(send: () => Promise<R>): Promise<{ res: R; retries: number }> {
  let res = await send()
  let retries = 0
  while (retries < 5 && res.status === 429) {
    const body = await res.clone().json() as { error?: string; retryAfterSeconds?: number }
    if (body.error !== 'attempt_in_progress') break
    await sleep(Math.min((body.retryAfterSeconds ?? 1) * 1000, 3000))
    res = await send()
    retries++
  }
  return { res, retries }
}

type One = { loginStatus: number; loginRetries: number; loginMs: number; verifyStatus: number | null; verifyRetries: number; verifyMs: number; totalMs: number; error?: string }

async function loginOnce(email: string, ip: string): Promise<One> {
  const headers = { 'Content-Type': 'application/json', 'user-agent': WINDOWS_CHROME, 'x-forwarded-for': ip }
  const t0 = performance.now()
  const login = await postWithBusyRetry(() => LOGIN(new Request('http://localhost/api/auth/login', { method: 'POST', headers, body: JSON.stringify({ email, password: PASSWORD }) })))
  const t1 = performance.now()
  const base = { loginStatus: login.res.status, loginRetries: login.retries, loginMs: t1 - t0 }
  if (login.res.status !== 200) {
    return { ...base, verifyStatus: null, verifyRetries: 0, verifyMs: 0, totalMs: t1 - t0, error: ((await login.res.json()) as { error?: string }).error }
  }
  const pendingId = login.res.cookies.get('mfa_pending')?.value ?? ''
  const code = await readEmulatorSmsCode((await firestoreMfaPendingRepository.get(pendingId))!.sessionInfo)
  const t2 = performance.now()
  const verify = await postWithBusyRetry(() => VERIFY(new Request('http://localhost/api/auth/login/verify', {
    method: 'POST', headers: { ...headers, cookie: `mfa_pending=${pendingId}` }, body: JSON.stringify({ code }),
  })))
  const t3 = performance.now()
  const error = verify.res.status === 200 ? undefined : ((await verify.res.json()) as { error?: string }).error
  return { ...base, verifyStatus: verify.res.status, verifyRetries: verify.retries, verifyMs: t3 - t2, totalMs: t1 - t0 + (t3 - t2), error }
}

// 同じ回線のほかのアカウントの失敗を、IP の回数に入れておく（失敗2回で、同時に出せる札は1枚になる）
async function seedIpFailures(ip: string, failures: number) {
  const key = [{ kind: 'ip' as const, value: ip }]
  for (let i = 0; i < failures; i++) {
    await firestoreLoginThrottleRepository.acquire(key, Date.now(), `seed-${i}`)
    await firestoreLoginThrottleRepository.complete(key, `seed-${i}`, 'failure', Date.now())
  }
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(q * s.length))]
}
const round = (n: number) => Math.round(n)

const results: Record<string, unknown> = {}
const lines: string[] = []

beforeAll(async () => {
  for (const c of ['loginThrottle', 'mfaPending', 'mfaSmsQuota']) await adminDb.recursiveDelete(adminDb.collection(c))
})
afterAll(async () => {
  globalThis.fetch = realFetch
  await adminAuth.deleteUsers(createdUids)
  for (const c of ['loginThrottle', 'mfaPending', 'mfaSmsQuota']) await adminDb.recursiveDelete(adminDb.collection(c))
  const dir = path.resolve(__dirname, '../../perf-results')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `mfa-${LABEL}.json`), `${JSON.stringify({ label: LABEL, at: new Date().toISOString(), runs: RUNS, results }, null, 2)}\n`)
  console.log(['', ...lines].join('\n'))
})

describe('ログインの時間と、同じ回線の同時ログイン', () => {
  it.each([0, 500, 1500])('1台が1回ログインする時間（Identity Toolkit の遅れ %i ms）', async (delay) => {
    identityToolkitDelayMs = delay
    const [email] = await createUsers(1)
    const ip = nextIp()
    const ones: One[] = []
    for (let i = 0; i < RUNS; i++) ones.push(await loginOnce(email, ip))
    const ok = ones.filter((o) => o.verifyStatus === 200)
    const summary = {
      success: `${ok.length}/${RUNS}`,
      loginMs: { p50: round(quantile(ok.map((o) => o.loginMs), 0.5)), p90: round(quantile(ok.map((o) => o.loginMs), 0.9)) },
      verifyMs: { p50: round(quantile(ok.map((o) => o.verifyMs), 0.5)), p90: round(quantile(ok.map((o) => o.verifyMs), 0.9)) },
      errors: ones.filter((o) => o.error).map((o) => o.error),
    }
    results[`single-delay${delay}`] = summary
    lines.push(`1台 / 遅れ ${delay}ms: 成功 ${summary.success} / 1段目 p50 ${summary.loginMs.p50}ms p90 ${summary.loginMs.p90}ms / 2段目 p50 ${summary.verifyMs.p50}ms p90 ${summary.verifyMs.p90}ms ${summary.errors.length ? `/ 失敗 ${summary.errors.join(',')}` : ''}`)
  })

  it.each([
    [5, 0, 0], [5, 500, 0], [5, 1500, 0],
    [5, 0, 2], [5, 500, 2], [5, 1500, 2],
    [8, 1500, 0],
  ])('同じ回線の %i 台が同時にログインする（遅れ %i ms、IP の前の失敗 %i 回）', async (pcs, delay, ipFailures) => {
    identityToolkitDelayMs = delay
    const emails = await createUsers(pcs)
    const ip = nextIp()
    await seedIpFailures(ip, ipFailures)
    const ones = await Promise.all(emails.map((e) => loginOnce(e, ip)))
    const ok = ones.filter((o) => o.verifyStatus === 200)
    const summary = {
      success: `${ok.length}/${pcs}`,
      maxTotalMs: round(Math.max(...ones.map((o) => o.totalMs))),
      loginRetries: ones.map((o) => o.loginRetries),
      verifyRetries: ones.map((o) => o.verifyRetries),
      errors: ones.filter((o) => o.error).map((o) => o.error),
    }
    results[`concurrent-${pcs}pcs-delay${delay}-ipfail${ipFailures}`] = summary
    lines.push(`${pcs}台同時 / 遅れ ${delay}ms / IP の前の失敗 ${ipFailures}: 成功 ${summary.success} / いちばん遅い人 ${summary.maxTotalMs}ms / 送り直し 1段目 [${summary.loginRetries}] 2段目 [${summary.verifyRetries}] ${summary.errors.length ? `/ 失敗 ${summary.errors.join(',')}` : ''}`)
  })
})
