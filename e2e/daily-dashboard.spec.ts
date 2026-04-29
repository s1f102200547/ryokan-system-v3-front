import { test, expect, type Page } from '@playwright/test'

async function fixDateTo0412(page: Page) {
  await page.addInitScript(() => {
    const FIXED = new Date('2026-04-12T12:00:00+09:00').getTime()
    const RD = globalThis.Date
    class MockDate extends RD {
      constructor(...args: ConstructorParameters<typeof Date>) {
        // @ts-expect-error spread into Date constructor
        super(...(args.length === 0 ? [FIXED] : args))
      }
      static now() { return FIXED }
      static parse(s: string) { return RD.parse(s) }
      static UTC(...args: Parameters<typeof Date.UTC>) { return RD.UTC(...args) }
    }
    // @ts-expect-error replace global Date
    globalThis.Date = MockDate
  })
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.waitForURL('/')
}

test.describe('デイリーダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await fixDateTo0412(page)
    await login(page, email!, password!)
    await page.goto('/daily-dashboard')
    // SSRは実日付でレンダリングされるため、hydration完了（モック日付に切り替わる）まで待機
    await expect(page.getByTestId('date-label')).toContainText('4/12')
  })

  // ── 初期表示 ────────────────────────────────────────────────────────────

  test('今日の日付（4/12）が表示される', async ({ page }) => {
    await expect(page.getByTestId('date-label')).toContainText('4/12')
  })

  test('「今日」ラベルが表示される', async ({ page }) => {
    await expect(page.getByTestId('diff-label')).toContainText('今日')
  })

  test('タイムテーブル印刷ボタンが表示される', async ({ page }) => {
    await expect(page.getByTestId('print-timetable')).toBeVisible()
  })

  test('清掃ボード印刷ボタンが表示される', async ({ page }) => {
    await expect(page.getByTestId('print-cleaning-board')).toBeVisible()
  })

  // ── 日付ナビゲーション ──────────────────────────────────────────────────

  test('翌日ボタンで 4/13「明日」に移動する', async ({ page }) => {
    await page.getByTestId('next-day').click()
    await expect(page.getByTestId('date-label')).toContainText('4/13')
    await expect(page.getByTestId('diff-label')).toContainText('明日')
  })

  test('前日ボタンで 4/11「昨日」に移動する', async ({ page }) => {
    await page.getByTestId('prev-day').click()
    await expect(page.getByTestId('date-label')).toContainText('4/11')
    await expect(page.getByTestId('diff-label')).toContainText('昨日')
  })

  test('Today ボタンで今日（4/12）に戻る', async ({ page }) => {
    await page.getByTestId('next-day').click()
    await expect(page.getByTestId('date-label')).toContainText('4/13')

    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page.getByTestId('date-label')).toContainText('4/12')
    await expect(page.getByTestId('diff-label')).toContainText('今日')
  })

  // ── 印刷ボタン ──────────────────────────────────────────────────────────

  test('タイムテーブル印刷ボタンで /timetable?date=2026-04-12&autoprint=1 が開く', async ({ page, context }) => {
    await context.route('/api/timetable*', (route) => route.abort())

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('print-timetable').click(),
    ])
    await expect(newPage).toHaveURL(/\/timetable\?date=2026-04-12&autoprint=1/)
    await newPage.close()
  })

  test('清掃ボード印刷ボタンで /cleaning-board?date=2026-04-12&autoprint=1 が開く', async ({ page, context }) => {
    await context.route('/api/cleaning-board*', (route) => route.abort())

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('print-cleaning-board').click(),
    ])
    await expect(newPage).toHaveURL(/\/cleaning-board\?date=2026-04-12&autoprint=1/)
    await newPage.close()
  })
})

test.describe('印刷ページリダイレクト', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await login(page, email!, password!)
  })

  test('/timetable を ?date= なしで開くと /daily-dashboard にリダイレクトされる', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.abort())
    await page.goto('/timetable')
    await expect(page).toHaveURL('/daily-dashboard')
  })

  test('/cleaning-board を ?date= なしで開くと /daily-dashboard にリダイレクトされる', async ({ page }) => {
    await page.route('/api/cleaning-board*', (route) => route.abort())
    await page.goto('/cleaning-board')
    await expect(page).toHaveURL('/daily-dashboard')
  })
})
