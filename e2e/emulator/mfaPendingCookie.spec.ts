import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createMfaUser, submitPassword } from './mfa'
import { MFA_PENDING_TTL_MS } from '../../src/constants/auth'

// SMS の2要素目の途中の状態の Cookie（mfa_pending）の属性が、防ぐはずのことを実際に止めていること（docs/MfaBugHunt.md の S12）。
// パスワードを通しただけのこの Cookie は、コードの確認（/api/auth/login/verify）にだけ使う。
// 各テストに対照実験を置く: 1段目の Set-Cookie を書き換えて属性を外すと、止まらなくなること

const APP = 'http://127.0.0.1:3200'
const EVIL = 'http://localhost:4999'
const PASSWORD = 'emutest-password'
const RUN_ID = `emutest-mfacookie-${Date.now()}`

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Auth Emulator にだけ接続する')
const adminAuth = getAuth(getApps()[0] ?? initializeApp({ projectId: 'demo-ryokan' }))
const createdUids: string[] = []
test.afterAll(async () => { await adminAuth.deleteUsers(createdUids) })

// パスワードを通し、コードの入力欄が出るまで（mfa_pending を受け取った状態）
async function passwordStep(page: Page) {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  createdUids.push(await createMfaUser(adminAuth, email, PASSWORD))
  await page.goto('/login')
  await submitPassword(page, email, PASSWORD)
  await page.getByLabel('確認コード').waitFor()
}

// 対照実験: 1段目の応答の Set-Cookie を書き換える
async function rewritePendingCookie(context: BrowserContext, rewrite: (setCookie: string) => string) {
  await context.route(`${APP}/api/auth/login`, async (route) => {
    // route.fetch は Playwright から送り直すので、ブラウザが付けた Sec-Fetch-Site が落ちる（allHeaders にも出ない）。
    // 元はログイン画面（同じサイト）からの要求なので、same-origin を付け直す（ログインの API が求める。F-21）
    const response = await route.fetch({ headers: { ...route.request().headers(), 'sec-fetch-site': 'same-origin' } })
    const headers = { ...response.headers() }
    headers['set-cookie'] = rewrite(headers['set-cookie'] ?? '')
    await route.fulfill({ response, headers })
  })
}
const pathToRoot = (c: string) => c.replace(/Path=[^;]*/i, 'Path=/')

// アプリへのリクエストの Cookie ヘッダーを記録する
function recordCookies(context: BrowserContext) {
  const sent: { url: string; method: string; cookie: string }[] = []
  context.on('request', async (request) => {
    if (!request.url().startsWith(APP)) return
    sent.push({ url: request.url(), method: request.method(), cookie: (await request.allHeaders())['cookie'] ?? '' })
  })
  return sent
}

test('ブラウザに残る属性: HttpOnly・SameSite=Strict・Path=/api/auth/login・5分', async ({ page, context }) => {
  const before = Date.now()
  await passwordStep(page)
  // context.cookies は渡した URL に送る Cookie だけを返す。Path が /api/auth/login なので、その URL で読む
  expect((await context.cookies(APP)).some((c) => c.name === 'mfa_pending')).toBe(false)
  const cookie = (await context.cookies(`${APP}/api/auth/login/verify`)).find((c) => c.name === 'mfa_pending')
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/auth/login' })
  expect(cookie!.expires * 1000).toBeGreaterThanOrEqual(before + MFA_PENDING_TTL_MS - 2000)
  expect(cookie!.expires * 1000).toBeLessThanOrEqual(Date.now() + MFA_PENDING_TTL_MS + 2000)
})

test.describe('HttpOnly: ページの JavaScript から読めない', () => {
  const readable = (page: Page) => page.evaluate(() => document.cookie.includes('mfa_pending='))
  test('読めない', async ({ page }) => {
    await passwordStep(page)
    expect(await readable(page)).toBe(false)
  })
  // Path のままだと /login のページからは見えないので、Path も / にして比べる
  test('対照: HttpOnly を外し Path を / にすると読める', async ({ page, context }) => {
    await rewritePendingCookie(context, (c) => pathToRoot(c).replace(/;\s*HttpOnly/i, ''))
    await passwordStep(page)
    expect(await readable(page)).toBe(true)
  })
})

test.describe('Path: ログインの API 以外には送らない', () => {
  async function cookieSentToOtherApi(page: Page, context: BrowserContext) {
    const sent = recordCookies(context)
    await page.evaluate(() => fetch('/api/guest-info?date=2026-05-20'))
    await expect.poll(() => sent.some((r) => r.url.includes('/api/guest-info'))).toBe(true)
    return sent.find((r) => r.url.includes('/api/guest-info'))!.cookie
  }
  test('ほかの API へのリクエストに mfa_pending は載らない', async ({ page, context }) => {
    await passwordStep(page)
    expect(await cookieSentToOtherApi(page, context)).not.toContain('mfa_pending=')
  })
  test('対照: Path を / にすると載る', async ({ page, context }) => {
    await rewritePendingCookie(context, pathToRoot)
    await passwordStep(page)
    expect(await cookieSentToOtherApi(page, context)).toContain('mfa_pending=')
  })
})

test.describe('SameSite=Strict: 他のサイトから、コードの確認に送らせない', () => {
  async function cookieSentFromEvilForm(page: Page, context: BrowserContext) {
    await context.route(`${EVIL}/**`, (route) => route.fulfill({
      status: 200, contentType: 'text/html',
      body: `<!doctype html><form id="f" method="POST" action="${APP}/api/auth/login/verify" enctype="text/plain"><input name='{"code":"123456","x":"' value='"}'></form>`,
    }))
    const sent = recordCookies(context)
    await page.goto(`${EVIL}/`)
    await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).submit())
    await expect.poll(() => sent.some((r) => r.method === 'POST' && r.url.endsWith('/api/auth/login/verify'))).toBe(true)
    return sent.find((r) => r.method === 'POST' && r.url.endsWith('/api/auth/login/verify'))!.cookie
  }
  test('他のサイトのフォームから verify に POST しても、mfa_pending は送られない', async ({ page, context }) => {
    await passwordStep(page)
    expect(await cookieSentFromEvilForm(page, context)).not.toContain('mfa_pending=')
  })
  // SameSite がない Cookie は、Chrome の既定（Lax）で、作ってから2分以内のトップレベルの POST には送られる（Lax+POST）。
  // mfa_pending はパスワードの直後に作るので、ちょうどこの2分に入る
  test('対照: SameSite を外すと、パスワードの直後の他のサイトからの POST に送られる', async ({ page, context }) => {
    await rewritePendingCookie(context, (c) => c.replace(/;\s*SameSite=\w+/i, ''))
    await passwordStep(page)
    expect(await cookieSentFromEvilForm(page, context)).toContain('mfa_pending=')
  })
})
