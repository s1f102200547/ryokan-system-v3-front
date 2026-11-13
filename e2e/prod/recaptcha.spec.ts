import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// ログイン画面の reCAPTCHA Enterprise が、本番の CSP・ヘッダーのもとで動くこと（SMS の送信に Identity Platform が token を求める）。
// Google には接続しない。enterprise.js・iframe・通信の先を page.route で偽物に差し替え、本物と同じことをさせる:
//   こちらの script が足した enterprise.js（'strict-dynamic'）→ Google の iframe（frame-src）→ Google への通信（connect-src）→ token
// 対照実験: CSP から frame-src を外すと iframe が止められる（ページの中で直接 iframe を作って比べる）。
// サイトキーは playwright.prod.config.ts の webServer.env。本番は 23:00〜6:00 JST にログイン画面を開けないので、そのときは飛ばす

const APP = 'http://127.0.0.1:3100'

// 本番の時間外（23:00〜6:00 JST）は /login が /time-restricted への転送になり、ログイン画面を開けない。そのときは飛ばす
test.beforeEach(async ({ request }) => {
  const login = await request.get('/login', { maxRedirects: 0 })
  test.skip(login.status() !== 200, '本番の時間外はログイン画面を開けない')
})

const FAKE_ENTERPRISE_JS = `
  (() => {
    const violations = []
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.effectiveDirective))
    window.__recaptchaViolations = violations
    window.grecaptcha = { enterprise: {
      ready: (cb) => cb(),
      execute: async (siteKey, { action }) => {
        const frame = document.createElement('iframe')
        frame.src = 'https://www.google.com/recaptcha/enterprise/anchor?k=' + encodeURIComponent(siteKey)
        document.body.append(frame)
        await new Promise((r) => setTimeout(r, 500))
        const reload = await fetch('https://www.google.com/recaptcha/enterprise/reload?k=' + encodeURIComponent(siteKey), { method: 'POST' })
        return 'fake-token:' + action + ':' + (await reload.text())
      },
    } }
  })()`

async function fakeGoogle(context: BrowserContext) {
  const hits: string[] = []
  await context.route('https://www.google.com/recaptcha/**', async (route) => {
    const url = new URL(route.request().url())
    hits.push(url.pathname)
    if (url.pathname === '/recaptcha/enterprise.js') return route.fulfill({ contentType: 'text/javascript', body: FAKE_ENTERPRISE_JS })
    if (url.pathname.endsWith('/anchor')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>anchor</title>' })
    return route.fulfill({ contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': APP }, body: 'ok' })
  })
  return hits
}

// ログイン API はモック（SMS の段へ進む応答）。送られた body を記録する
async function captureLogin(page: Page) {
  const bodies: unknown[] = []
  await page.route('**/api/auth/login', (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'))
    return route.fulfill({ status: 200, json: { mfaRequired: true, phoneHint: '+81*******1234' } })
  })
  return bodies
}

async function submit(page: Page) {
  await page.goto('/login')
  // React がフォームを受け持つまで待つ（その前に押すと、ブラウザ本来の送信でページが読み込み直されるだけになる）
  await page.waitForFunction(() => {
    const form = document.querySelector('form')
    return form !== null && Object.keys(form).some((k) => k.startsWith('__reactProps'))
  })
  await page.getByLabel('メールアドレス').fill('pc1@example.com')
  await page.getByLabel('パスワード').fill('password')
  await page.getByRole('button', { name: 'ログイン' }).click()
}

test('ログイン画面は enterprise.js を読み込み、iframe と通信が CSP に止められず、token をログイン API に送る', async ({ page, context }) => {
  const hits = await fakeGoogle(context)
  const bodies = await captureLogin(page)
  await submit(page)
  await expect(page.getByLabel('確認コード')).toBeVisible()

  expect(bodies).toEqual([{ email: 'pc1@example.com', password: 'password', recaptchaToken: 'fake-token:mfaSmsSignIn:ok' }])
  expect(hits).toEqual(expect.arrayContaining(['/recaptcha/enterprise.js', '/recaptcha/enterprise/anchor', '/recaptcha/enterprise/reload']))
  expect(await page.evaluate(() => (window as unknown as { __recaptchaViolations: string[] }).__recaptchaViolations)).toEqual([])
})

// ログイン画面の CSP が Google の iframe を許していること。ページの中で直接 iframe を作り、CSP の違反が起きるかを見る
async function frameViolations(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const violations: string[] = []
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.effectiveDirective))
    const frame = document.createElement('iframe')
    frame.src = 'https://www.google.com/recaptcha/enterprise/anchor?k=e2e'
    document.body.append(frame)
    await new Promise((r) => setTimeout(r, 1000))
    return violations
  })
}

test('ログイン画面の CSP は、Google の reCAPTCHA の iframe を止めない', async ({ page, context }) => {
  const hits = await fakeGoogle(context)
  await page.goto('/login')
  expect(await frameViolations(page)).toEqual([])
  expect(hits).toContain('/recaptcha/enterprise/anchor')
})

test('対照: CSP から frame-src を外すと、Google の iframe が止められる', async ({ page, context }) => {
  await context.route(`${APP}/login`, async (route) => {
    const response = await route.fetch()
    const headers = { ...response.headers() }
    headers['content-security-policy'] = headers['content-security-policy'].split(';').map((d) => d.trim()).filter((d) => !d.startsWith('frame-src')).join('; ')
    await route.fulfill({ response, headers })
  })
  const hits = await fakeGoogle(context)
  await page.goto('/login')
  expect(await frameViolations(page)).toContain('frame-src')
  expect(hits).not.toContain('/recaptcha/enterprise/anchor')
})

test('Google の reCAPTCHA を読み込めなければ、パスワードを送らずに理由を出す', async ({ page, context }) => {
  await context.route('https://www.google.com/recaptcha/**', (route) => route.abort())
  const bodies = await captureLogin(page)
  await submit(page)
  await expect(page.getByText('ブラウザの確認（reCAPTCHA）を読み込めませんでした')).toBeVisible()
  expect(bodies).toEqual([])
})
