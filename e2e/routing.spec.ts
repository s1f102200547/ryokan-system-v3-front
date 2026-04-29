import { test, expect } from '@playwright/test'

test.describe('ルーティング', () => {
  test('未定義パスに未認証でアクセスすると /login にリダイレクトされる', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL('/login')
  })

  test('未定義パスに認証済みでアクセスすると / にリダイレクトされる', async ({ page, context }) => {
    await context.addCookies([
      { name: 'session', value: 'mock-session', url: 'http://localhost:3000' },
    ])
    // リダイレクト先の /cleaning-board が API を叩くのでモックする
    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: { rows: [], unassignedReservations: [] } }),
    )

    await page.goto('/this-page-does-not-exist')
    await expect(page).toHaveURL('/cleaning-board')
  })
})
