import { test, expect } from '@playwright/test'

test.describe('ルーティング', () => {
  test('未定義パスに未認証でアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL('/login')
  })

  test('未定義パスに認証済みでアクセスすると /daily-dashboard にリダイレクトされる', async ({ page, context }) => {
    await context.addCookies([
      { name: 'session', value: 'mock-session', url: 'http://127.0.0.1:3000' },
    ])
    // 画面のルーティングだけを見る。API は開発サーバーに届かせない（届くと mock-session は 401 でログイン画面に移る）
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { error: 'not mocked' } }))

    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL('/daily-dashboard')
  })
})

test.describe('セッション切れ', () => {
  // Cookie はあるがサーバー側で無効（期限切れ、Emulator の再起動など）のとき、API は 401 を返す
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'session', value: 'expired-session', url: 'http://127.0.0.1:3000' },
    ])
  })

  test('ダッシュボードの API が 401 を返すと /login に移り、エラーは表示しない', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }))
    await page.goto('/daily-dashboard')
    await expect(page).toHaveURL('/login')
    await expect(page.getByText('取得に失敗')).toHaveCount(0)
  })

  test('宿泊税の API が 401 を返すと /login に移る', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }))
    await page.goto('/a_tax_table')
    await expect(page).toHaveURL('/login')
  })

  test('401 以外のエラーではログイン画面に移らない', async ({ page }) => {
    await page.route('**/api/**', (route) => route.fulfill({ status: 503, json: { error: 'unavailable' } }))
    await page.goto('/daily-dashboard')
    await expect(page.getByText(/一時的に通信に失敗しました/).first()).toBeVisible()
    await expect(page).toHaveURL(/\/daily-dashboard/)
  })
})
