import { test, expect, type Page } from '@playwright/test'
import { LoginBodySchema } from '../src/lib/api/loginSchema'

// ログイン画面。ブラウザはメールアドレスとパスワードを /api/auth/login に、SMS のコードを /api/auth/login/verify に送るだけ
// （パスワード・コードの確認はサーバー）。ここでは API をモックし、画面の振る舞いを見る。本物のログインは e2e/emulator/

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
    await expect(page.getByText(/ログインの失敗が続いたため、あと [45]:\d\d はログインできません/)).toBeVisible()
    // 止められている間は、ログインボタンだけ押せない（入力欄は触れる。読み込み直すと戻る）
    await expect(page.getByLabel('メールアドレス')).toBeEnabled()
    await expect(page.getByLabel('パスワード')).toBeEnabled()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeDisabled()
    await page.reload()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  })

  test.describe('SMS のコード（2段目）', () => {
    // サーバー側: パスワードを確かめ SMS を送る（1段目）。コードを確かめ Session Cookie を発行する（2段目）
    async function mockLogin(page: Page, verify: Parameters<Page['route']>[1]) {
      await page.route('**/api/auth/login', (route) => route.fulfill({ status: 200, json: { mfaRequired: true, phoneHint: '+81*******1234' } }))
      await page.route('**/api/auth/login/verify', verify)
    }
    const ok = (route: Parameters<Parameters<Page['route']>[1]>[0]) => route.fulfill({
      status: 200,
      headers: { 'Set-Cookie': 'session=mock-session; Path=/; HttpOnly; SameSite=Strict' },
      json: { success: true },
    })

    test('パスワードの後に、伏せ字の電話番号とコードの入力欄を出す。正しいコードでダッシュボードへ', async ({ page }) => {
      const sent: (string | null)[] = []
      await mockLogin(page, (route) => { sent.push(route.request().postData()); return ok(route) })
      await submit(page, 'test@example.com', 'password')

      await expect(page.getByText('+81*******1234 にSMS で送った 6 桁のコードを入力してください')).toBeVisible()
      const code = page.getByLabel('確認コード')
      await expect(code).toBeFocused()
      await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
      await expect(code).toHaveAttribute('inputmode', 'numeric')
      await code.fill('123456')
      await page.getByRole('button', { name: '確認' }).click()
      await expect(page).toHaveURL('/daily-dashboard')
      expect(sent.map((b) => JSON.parse(b ?? '{}'))).toEqual([{ code: '123456' }])
    })

    test('数字以外は入らず、6桁までしか入らない', async ({ page }) => {
      await mockLogin(page, ok)
      await submit(page, 'test@example.com', 'password')
      const code = page.getByLabel('確認コード')
      await code.pressSequentially('12a3-45 678')
      await expect(code).toHaveValue('123456')
    })

    test('コードが違えば理由を出し、打ち直せる', async ({ page }) => {
      let calls = 0
      await mockLogin(page, (route) => (++calls === 1 ? route.fulfill({ status: 401, json: { error: 'invalid_code' } }) : ok(route)))
      await submit(page, 'test@example.com', 'password')
      await page.getByLabel('確認コード').fill('000000')
      await page.getByRole('button', { name: '確認' }).click()
      await expect(page.getByText('コードが正しくありません')).toBeVisible()
      await page.getByLabel('確認コード').fill('123456')
      await page.getByRole('button', { name: '確認' }).click()
      await expect(page).toHaveURL('/daily-dashboard')
    })

    test('期限が切れたら、パスワードの画面に戻して理由を出す', async ({ page }) => {
      await mockLogin(page, (route) => route.fulfill({ status: 401, json: { error: 'mfa_expired' } }))
      await submit(page, 'test@example.com', 'password')
      await page.getByLabel('確認コード').fill('123456')
      await page.getByRole('button', { name: '確認' }).click()
      await expect(page.getByText('コードの有効期限が切れました。もう一度ログインしてください')).toBeVisible()
      await expect(page.getByLabel('パスワード')).toHaveValue('password') // 押し直すだけで入り直せる
    })

    test('再送は1段目を送り直し、知らせを出す。戻るでパスワードの画面へ', async ({ page }) => {
      let logins = 0
      await page.route('**/api/auth/login', (route) => { logins++; return route.fulfill({ status: 200, json: { mfaRequired: true, phoneHint: '+81*******1234' } }) })
      await submit(page, 'test@example.com', 'password')
      await page.getByRole('button', { name: 'コードを再送' }).click()
      await expect(page.getByText('コードを再送しました')).toBeVisible()
      expect(logins).toBe(2)
      await page.getByRole('button', { name: '戻る' }).click()
      await expect(page.getByLabel('メールアドレス')).toHaveValue('test@example.com')
    })

    test('ブラウザは Firebase を呼ばず、コードを自分の API にだけ送る', async ({ page }) => {
      const requests: string[] = []
      page.on('request', (r) => requests.push(r.url()))
      await mockLogin(page, ok)
      await submit(page, 'test@example.com', 'password')
      await page.getByLabel('確認コード').fill('123456')
      await page.getByRole('button', { name: '確認' }).click()
      await expect(page).toHaveURL('/daily-dashboard')
      expect(requests.filter((u) => /googleapis\.com|firebase|recaptcha|gstatic/.test(u))).toEqual([])
    })
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
