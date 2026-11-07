import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

// セッション Cookie の属性が、それぞれ防ぐはずのことを実際に止めていること。Cookie は本物のログイン（Auth Emulator）で受け取る。
// 各テストには対照実験を入れる: ログインの Set-Cookie からその属性だけを外すと止まらなくなること。
// Secure（HTTPS のときだけ送る）は本番だけで付けるので、ここでは確かめない（tests/integration/api/auth/login/route.test.ts）

const APP = 'http://127.0.0.1:3200'
// 攻撃者のサイト。127.0.0.1 とは別のオリジン・別のサイト
const EVIL = 'http://localhost:4999'
const PASSWORD = 'emutest-password'
const RUN_ID = `emutest-cookie-${Date.now()}`

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Auth Emulator にだけ接続する')
const adminAuth = getAuth(getApps()[0] ?? initializeApp({ projectId: 'demo-ryokan' }))
const createdUids: string[] = []

test.afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
})

async function createUser(): Promise<{ email: string; uid: string }> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  const user = await adminAuth.createUser({ email, password: PASSWORD })
  createdUids.push(user.uid)
  return { email, uid: user.uid }
}

// ログインの Set-Cookie から属性を外す（対照実験）
async function stripCookieAttribute(context: BrowserContext, attribute: RegExp) {
  await context.route(`${APP}/api/auth/login`, async (route) => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    headers['set-cookie'] = headers['set-cookie'].replace(attribute, '')
    await route.fulfill({ response, headers })
  })
}

// 画面からログインする（ブラウザの Firebase SDK → Auth Emulator → /api/auth/login）
async function loginFromUi(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.waitForURL('**/daily-dashboard**')
}

async function sessionCookie(context: BrowserContext) {
  return (await context.cookies(APP)).find((c) => c.name === 'session')
}

// 攻撃者のサイトを用意し、アプリへ来たリクエストの Cookie ヘッダーを記録する
async function evilSite(context: BrowserContext, html: string) {
  await context.route(`${EVIL}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }))
  const sent: { url: string; method: string; cookie: string }[] = []
  context.on('request', async (request) => {
    if (!request.url().startsWith(APP)) return
    sent.push({ url: request.url(), method: request.method(), cookie: (await request.allHeaders())['cookie'] ?? '' })
  })
  return sent
}

test.describe('HttpOnly: XSS で入った script に Cookie を盗ませない', () => {
  const readable = (page: Page) => page.evaluate(() => document.cookie.includes('session='))

  test('ページの JavaScript から session Cookie を読めない', async ({ page, context }) => {
    const { email } = await createUser()
    await loginFromUi(page, email)
    expect(await sessionCookie(context)).toBeDefined()
    expect(await readable(page)).toBe(false)
  })

  test('対照: HttpOnly を外すと読める', async ({ page, context }) => {
    await stripCookieAttribute(context, /;\s*HttpOnly/i)
    const { email } = await createUser()
    await loginFromUi(page, email)
    expect(await readable(page)).toBe(true)
  })
})

test.describe('SameSite=Strict: 他のサイトから、ログイン中のスタッフの名前で操作させない（CSRF）', () => {
  async function followLinkFromEvil(page: Page, context: BrowserContext) {
    const sent = await evilSite(context, `<!doctype html><a id="go" href="${APP}/daily-dashboard">go</a>`)
    await page.goto(`${EVIL}/`)
    await page.click('#go')
    await page.waitForLoadState()
    await expect.poll(() => sent.some((r) => r.url.startsWith(`${APP}/daily-dashboard`))).toBe(true)
    const navigation = sent.find((r) => r.url.startsWith(`${APP}/daily-dashboard`))
    return { url: page.url(), cookieSent: navigation?.cookie.includes('session=') ?? false }
  }

  test('他のサイトのリンクから開くと Cookie が送られず、ログイン画面に移る', async ({ page, context }) => {
    const { email } = await createUser()
    await loginFromUi(page, email)
    const result = await followLinkFromEvil(page, context)
    expect(result.cookieSent).toBe(false)
    expect(new URL(result.url).pathname).toBe('/login')
  })

  test('対照: SameSite を外す（ブラウザの既定の Lax）と、リンクで Cookie が送られてダッシュボードが開く', async ({ page, context }) => {
    await stripCookieAttribute(context, /;\s*SameSite=\w+/i)
    const { email } = await createUser()
    await loginFromUi(page, email)
    const result = await followLinkFromEvil(page, context)
    expect(result.cookieSent).toBe(true)
    expect(new URL(result.url).pathname).toBe('/daily-dashboard')
  })

  // フォームの POST は、属性を外した Lax でも（ログインから2分を過ぎれば）送られないので、対照実験は置かない
  test('他のサイトのフォームから API に POST しても Cookie が送られない', async ({ page, context }) => {
    const { email } = await createUser()
    await loginFromUi(page, email)
    const sent = await evilSite(context, `<!doctype html>
      <form id="f" method="POST" action="${APP}/api/reservations/emutest-none/cancel" enctype="text/plain">
        <input name='{"staff_name":"x","reason":"x","target_date":"2026-05-20","pad":"' value='"}'>
      </form>`)
    await page.goto(`${EVIL}/`)
    await page.evaluate(() => (document.getElementById('f') as HTMLFormElement).submit())
    // 記録は allHeaders() を待ってから入るので、入るまで待つ
    await expect.poll(() => sent.some((r) => r.method === 'POST' && r.url.includes('/api/reservations/'))).toBe(true)
    const post = sent.find((r) => r.method === 'POST' && r.url.includes('/api/reservations/'))
    expect(post?.cookie).not.toContain('session=')
  })
})

test.describe('Max-Age: ブラウザが Cookie を消す時刻を、サーバーの期限に合わせる', () => {
  // サーバーの期限: 当日 23:00 JST まで。残りが5分未満なら5分（src/app/api/auth/login/route.ts）
  function serverExpiry(nowMs: number): number {
    const jst = new Date(nowMs + 9 * 3600_000)
    const at23 = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 14, 0, 0)
    return nowMs + Math.max(at23 - nowMs, 5 * 60_000)
  }

  test('Cookie の期限がサーバーの期限と一致する', async ({ page, context }) => {
    const { email } = await createUser()
    const before = Date.now()
    await loginFromUi(page, email)
    const after = Date.now()
    const expires = (await sessionCookie(context))?.expires ?? 0
    expect(expires * 1000).toBeGreaterThanOrEqual(serverExpiry(before) - 2000)
    expect(expires * 1000).toBeLessThanOrEqual(serverExpiry(after) + 2000)
  })
})

test.describe('失効: Cookie がブラウザに残っていても、失効させたら使えない', () => {
  // firebase-admin は失効の時刻を秒で比べるので、ログインから秒をまたいでから失効させる（tests/emulator/sessionRevocation.test.ts）
  const nextSecond = () => new Promise((r) => setTimeout(r, 1100))

  for (const [label, revoke] of [
    ['revokeRefreshTokens', (uid: string) => adminAuth.revokeRefreshTokens(uid)],
    ['ユーザーの無効化', (uid: string) => adminAuth.updateUser(uid, { disabled: true }).then(() => undefined)],
  ] as const) {
    test(`${label} のあと、ダッシュボードを開き直すとログイン画面に移る`, async ({ page, context }) => {
      const { email, uid } = await createUser()
      await loginFromUi(page, email)
      await nextSecond()
      await revoke(uid)

      const responses: number[] = []
      page.on('response', (r) => { if (r.url().includes('/api/guest-info')) responses.push(r.status()) })
      await page.goto('/daily-dashboard')
      await page.waitForURL('**/login')
      expect(responses).toContain(401)
      // Cookie はブラウザに残ったまま（消えたから使えないのではなく、サーバーが拒否している）
      expect(await sessionCookie(context)).toBeDefined()
    })
  }
})
