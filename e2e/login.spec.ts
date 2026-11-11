import { test, expect, type Page } from '@playwright/test'
import { LoginBodySchema } from '../src/lib/api/loginSchema'

// ログイン画面。ブラウザはメールアドレスとパスワードを /api/auth/login に送るだけ（パスワードの確認はサーバー）。
// ここでは /api/auth/login をモックし、画面の振る舞いを見る。本物のログインは e2e/emulator/

async function submit(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}

test.describe('ログイン', () => {
  test('/ にアクセスするとログインページへリダイレクトされる', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })

  test('ログインページにフォームが表示される', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('メールアドレス')).toBeVisible()
    await expect(page.getByLabel('パスワード')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible()
  })

  test('ブラウザは Firebase を呼ばず、メールアドレスとパスワードを自分の API にだけ送る', async ({ page }) => {
    const requests: { url: string; body: string | null }[] = []
    page.on('request', (r) => requests.push({ url: r.url(), body: r.postData() }))
    await page.route('**/api/auth/login', (route) => route.fulfill({ status: 401, json: { error: 'invalid_credentials' } }))

    await submit(page, 'pc1@example.com', 'secret-pw')
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible()

    expect(requests.filter((r) => /googleapis\.com|firebase/.test(r.url))).toEqual([])
    const login = requests.find((r) => r.url.endsWith('/api/auth/login'))
    expect(JSON.parse(login?.body ?? '{}')).toEqual({ email: 'pc1@example.com', password: 'secret-pw' })
  })

  test('失敗が続いて止められているときは、何分後まで待つかを出す', async ({ page }) => {
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({ status: 429, headers: { 'Retry-After': '300' }, json: { error: 'too_many_attempts', retryAfterSeconds: 300 } }),
    )
    await submit(page, 'pc1@example.com', 'pw1')
    await expect(page.getByText('ログインの失敗が続いたため、5分後までログインできません')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  })

  test('正しい認証情報でログインするとダッシュボードに遷移する', async ({ page }) => {
    // サーバー側: パスワードを確かめ Session Cookie を発行する
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Set-Cookie': 'session=mock-session; Path=/; HttpOnly; SameSite=Strict' },
        json: { success: true },
      }),
    )

    await submit(page, 'test@example.com', 'password')
    await expect(page).toHaveURL('/daily-dashboard')
  })

  // バグハンティング（2026-11-11）: 差分テスト。ブラウザの <input type="email"> の判定と、サーバーの Zod の判定を同じ入力で比べる。
  // 食い違うと「画面では送れるのにサーバーで 400」か「サーバーは受け付けるのに画面で送れない」になる
  test('メールアドレスの形式の判定が、ブラウザとサーバーで一致する', async ({ page }) => {
    const candidates = [
      'pc1@example.com', 'a@b', 'pc1@localhost', 'pc1+front@example.com', "!#$%&'*+/=?^_`{|}~-@example.com",
      '.pc1@example.com', 'pc1.@example.com', 'p..c1@example.com', 'PC1@EXAMPLE.COM', 'pc1@example.com.',
      'pc1@-example.com', 'pc1@example-.com', 'pc1@ex_ample.com', 'pc1@[127.0.0.1]', 'pc1@127.0.0.1',
      'pc1@example..com', 'pc1@.example.com', '"pc 1"@example.com', 'pc1@exa mple.com', 'pc1@@example.com',
      'ピーシー@example.com', 'pc1@例え.jp', 'pc1@xn--r8jz45g.jp', ` pc1@example.com`, `pc1@example.com `,
      `${'a'.repeat(64)}@example.com`, `pc1@${'a'.repeat(63)}.com`, `pc1@${'a'.repeat(64)}.com`,
    ]
    await page.goto('/login')
    const input = page.getByLabel('メールアドレス')
    const mismatches: string[] = []
    for (const email of candidates) {
      await input.fill(email)
      // 入力欄の長さ（minLength・maxLength）は別に見るので、形式（typeMismatch）だけを比べる
      const browserOk = await input.evaluate((el) => !(el as HTMLInputElement).validity.typeMismatch)
      // ブラウザは type="email" の値を整える（前後の空白を除くなど）。サーバーに届くのは整えた後の値
      const sent = await input.inputValue()
      const serverOk = LoginBodySchema.safeParse({ email: sent, password: 'abc' }).success
      if (browserOk !== serverOk) mismatches.push(`${JSON.stringify(email)} → 送る値 ${JSON.stringify(sent)}: ブラウザ=${browserOk} サーバー=${serverOk}`)
    }
    expect(mismatches).toEqual([])
  })
})
