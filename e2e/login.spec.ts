import { test, expect } from '@playwright/test'

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

  test('誤った認証情報でログインするとエラーメッセージが表示される', async ({ page }) => {
    // Firebase を呼ばずに 401 を返す
    await page.route('/api/auth/login', (route) =>
      route.fulfill({ status: 401, json: { error: 'invalid credentials' } }),
    )

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill('wrong@example.com')
    await page.getByLabel('パスワード').fill('wrongpassword')
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(
      page.getByText('メールアドレスまたはパスワードが正しくありません')
    ).toBeVisible()
  })

  test('正しい認証情報でログインすると / に遷移する', async ({ page }) => {
    // Firebase を呼ばずに 200 + session cookie を返す
    await page.route('/api/auth/login', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Set-Cookie': 'session=mock-session; Path=/; HttpOnly; SameSite=Strict' },
        json: { success: true },
      }),
    )

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill('test@example.com')
    await page.getByLabel('パスワード').fill('password')
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(page).toHaveURL('/')
  })
})
