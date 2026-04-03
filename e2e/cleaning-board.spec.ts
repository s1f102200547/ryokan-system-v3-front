import { test, expect } from '@playwright/test'

type CleaningBoardRow = {
  room: string
  isTodayCheckIn: boolean
  isFutureCheckIn: boolean
  checkInReservation: {
    adult_count: number
    child_count: number
  } | null
  stayingReservation: {
    adult_count: number
    child_count: number
  } | null
  isStayingContinued: boolean
  isConsecutive: boolean
  autoNotes?: string[]
}

type UnassignedReservation = {
  id: string
  check_in_date: string
}

type CleaningBoardData = {
  rows: CleaningBoardRow[]
  unassignedReservations: UnassignedReservation[]
}

const ALL_ROOMS = ['21', '22', '31', '32', '42', '43', '61'] as const

function makeEmptyRows(): CleaningBoardRow[] {
  return ALL_ROOMS.map((room) => ({
    room,
    isTodayCheckIn: false,
    isFutureCheckIn: false,
    checkInReservation: null,
    stayingReservation: null,
    isStayingContinued: false,
    isConsecutive: false,
    autoNotes: [],
  }))
}

function mockCleaningBoard(
  rows: CleaningBoardRow[],
  unassignedReservations: UnassignedReservation[] = [],
): CleaningBoardData {
  return { rows, unassignedReservations }
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
    rows[0] = { ...rows[0], room: '21', isTodayCheckIn: true, checkInReservation: { adult_count: 2, child_count: 1 } }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-21')).toHaveText('2(1)')
  })

  test('当日CI・子供0人の場合は(child_count)を省略する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[1] = { ...rows[1], room: '22', isTodayCheckIn: true, checkInReservation: { adult_count: 3, child_count: 0 } }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-22')).toHaveText('3')
  })

  test('未来CIの部屋は括弧で囲んで表示する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[2] = { ...rows[2], room: '31', isFutureCheckIn: true, checkInReservation: { adult_count: 2, child_count: 1 } }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('ci-cell-31')).toHaveText('(2(1))')
  })

  test('未来CI・子供0人の場合は(adult_count)のみ表示する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[3] = { ...rows[3], room: '32', isFutureCheckIn: true, checkInReservation: { adult_count: 3, child_count: 0 } }

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

  test('部屋未割り当て予約がある場合、警告が表示される', async ({ page }) => {
    const unassigned: UnassignedReservation[] = [
      { id: 'r-unassigned', check_in_date: '2026-04-01' },
    ]

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(makeEmptyRows(), unassigned) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('unassigned-warning')).toBeVisible()
  })

  test('部屋未割り当て予約がない場合、警告は表示されない', async ({ page }) => {
    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(makeEmptyRows()) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('unassigned-warning')).not.toBeVisible()
  })
})

test.describe('清掃ボード - 連泊', () => {
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

  test('滞在継続中の部屋は伝達事項に「連泊(札置く)」を表示する', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = { ...rows[0], room: '21', isStayingContinued: true, isConsecutive: true }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('notes-cell-21')).toHaveText('連泊(札置く)')
    await expect(page.getByTestId('consecutive-cell-21')).toHaveText('')
  })

  test('滞在継続中の部屋は連泊列に人数を表示する（子供あり）', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = {
      ...rows[0],
      room: '21',
      isStayingContinued: true,
      stayingReservation: { adult_count: 2, child_count: 1 },
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('consecutive-cell-21')).toHaveText('2(1)')
    await expect(page.getByTestId('notes-cell-21')).toHaveText('')
  })

  test('滞在継続中の部屋は連泊列に人数を表示する（子供なし）', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[1] = {
      ...rows[1],
      room: '22',
      isStayingContinued: true,
      stayingReservation: { adult_count: 3, child_count: 0 },
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('consecutive-cell-22')).toHaveText('3')
  })

  test('連泊なしの場合、連泊列と伝達事項は空欄になる', async ({ page }) => {
    const rows = makeEmptyRows()

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    for (const room of ALL_ROOMS) {
      await expect(page.getByTestId(`consecutive-cell-${room}`)).toHaveText('')
      await expect(page.getByTestId(`notes-cell-${room}`)).toHaveText('')
    }
  })
})

test.describe('清掃ボード - 備考欄(autoNotes)', () => {
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

  test('autoNotes の文字列が備考欄に表示される', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = { ...rows[0], room: '21', autoNotes: ['21: レイトアウト11:00'] }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('auto-notes-box')).toHaveText('21: レイトアウト11:00')
  })

  test('autoNotes が複数あるとき改行して表示される', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = {
      ...rows[0],
      room: '21',
      autoNotes: ['21: 前日空室のためセットアップ済み', '22: 本日空室のため翌日以降の予約情報をもとにセットアップ', '31: レイトアウト11:00'],
    }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('auto-notes-box')).toContainText('21: 前日空室のためセットアップ済み')
    await expect(page.getByTestId('auto-notes-box')).toContainText(
      '22: 本日空室のため翌日以降の予約情報をもとにセットアップ',
    )
    await expect(page.getByTestId('auto-notes-box')).toContainText('31: レイトアウト11:00')
  })

  test('autoNotes が空のとき備考欄は空欄になる', async ({ page }) => {
    const rows = makeEmptyRows()

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/cleaning-board')

    await expect(page.getByTestId('auto-notes-box')).toHaveText('')
  })
})
