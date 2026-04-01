import { test, expect } from '@playwright/test'

type CleaningBoardRow = {
  room: string
  isTodayCheckIn: boolean
  isFutureCheckIn: boolean
  checkInReservation: {
    adult_count: number
    child_count: number
  } | null
}

const ALL_ROOMS = ['21', '22', '31', '32', '42', '43', '61'] as const

function makeEmptyRows(): CleaningBoardRow[] {
  return ALL_ROOMS.map((room) => ({
    room,
    isTodayCheckIn: false,
    isFutureCheckIn: false,
    checkInReservation: null,
  }))
}

function mockCleaningBoard(rows: CleaningBoardRow[]) {
  return rows
}

test.describe('清掃ボード - C/I列', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill(email!)
    await page.getByLabel('パスワード').fill(password!)
    await page.getByRole('button', { name: 'ログイン' }).click()
    await page.waitForURL('/')
  })

  test('当日CIの部屋はadult_count(child_count)を表示する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = {
      room: '21',
      isTodayCheckIn: true,
      isFutureCheckIn: false,
      checkInReservation: { adult_count: 2, child_count: 1 },
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-21')).toHaveText('2(1)')
  })

  test('当日CI・子供0人の場合は(child_count)を省略する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[1] = {
      room: '22',
      isTodayCheckIn: true,
      isFutureCheckIn: false,
      checkInReservation: { adult_count: 3, child_count: 0 },
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-22')).toHaveText('3')
  })

  test('未来CIの部屋は括弧で囲んで表示する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[2] = {
      room: '31',
      isTodayCheckIn: false,
      isFutureCheckIn: true,
      checkInReservation: { adult_count: 2, child_count: 1 },
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-31')).toHaveText('(2(1))')
  })

  test('未来CI・子供0人の場合は(adult_count)のみ表示する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[3] = {
      room: '32',
      isTodayCheckIn: false,
      isFutureCheckIn: true,
      checkInReservation: { adult_count: 3, child_count: 0 },
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-32')).toHaveText('(3)')
  })

  test('滞在中・空室の部屋はC/I列が空欄になる', async ({ page }) => {
    const rows = makeEmptyRows()

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    for (const room of ALL_ROOMS) {
      await expect(page.getByTestId(`ci-cell-${room}`)).toHaveText('')
    }
  })
})
