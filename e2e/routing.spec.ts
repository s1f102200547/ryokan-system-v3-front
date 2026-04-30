import { test, expect } from '@playwright/test'

test.describe('ルーティング', () => {
  test('未定義パスに未認証でアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL('/login')
  })

  test('未定義パスに認証済みでアクセスすると /daily-dashboard にリダイレクトされる', async ({ page, context }) => {
    await context.addCookies([
      { name: 'session', value: 'mock-session', url: 'http://localhost:3000' },
    ])

    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL('/daily-dashboard')
  })
})
