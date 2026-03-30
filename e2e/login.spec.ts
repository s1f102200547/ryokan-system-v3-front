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
    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill('wrong@example.com')
    await page.getByLabel('パスワード').fill('wrongpassword')
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('正しい認証情報でログインすると / に遷移する', async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill(email!)
    await page.getByLabel('パスワード').fill(password!)
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(page).toHaveURL('/')
  })
})
