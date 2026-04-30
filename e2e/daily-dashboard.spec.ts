import { test, expect, type Page } from '@playwright/test'
import { ROOM_NUMBERS, CLEANING_BOARD_ROOM_NUMBERS } from '../src/constants/room'

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー
// ─────────────────────────────────────────────────────────────────────────────

// diff-label (今日/明日/昨日) の計算に使われる client 側 getTodayJST() をモックする
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

async function suppressPrint(page: Page) {
  await page.addInitScript(() => { window.print = () => {} })
}

// ─────────────────────────────────────────────────────────────────────────────
// タイムテーブル モックデータ（元 timetable.spec.ts から移植）
// ─────────────────────────────────────────────────────────────────────────────

type TimetableData = {
  checkInSlots: Record<string, string[]>
  stayingGuestLabels: string[]
  eveningBathSlots: Record<string, string[]>
  dinnerSlots: Record<string, string[]>
  guestInfoRows: Record<string, string>
  breakfastSlots: Record<string, string[]>
  checkoutRooms: string[]
  morningBathSlots: Record<string, string[]>
  lateCheckoutRooms: string[]
}

function allVacantInfo(): Record<string, string> {
  return Object.fromEntries(ROOM_NUMBERS.map((r) => [r, '空室']))
}

function mockFor0412(): TimetableData {
  return {
    checkInSlots: { '15:00': ['㉑田中太郎-2'] },
    stayingGuestLabels: ['㉑-2(1/2泊目)'],
    eveningBathSlots: { '16:00': ['㉑'] },
    dinnerSlots: { '17:30': ['㉑田中太郎-2'] },
    guestInfoRows: { ...allVacantInfo(), '21': 'memo' },
    breakfastSlots: { '8:00a': ['㉑'] },
    checkoutRooms: [],
    morningBathSlots: {},
    lateCheckoutRooms: [],
  }
}

function mockFor0413(): TimetableData {
  return {
    checkInSlots: {},
    stayingGuestLabels: ['㉑-2(2/2泊目)'],
    eveningBathSlots: {},
    dinnerSlots: {},
    guestInfoRows: { ...allVacantInfo(), '21': '' },
    breakfastSlots: {},
    checkoutRooms: ['㉑'],
    morningBathSlots: {},
    lateCheckoutRooms: ['㉑'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 清掃ボード モックデータ（元 cleaning-board.spec.ts から移植）
// ─────────────────────────────────────────────────────────────────────────────

type CleaningBoardRow = {
  room: string
  isTodayCheckIn: boolean
  isFutureCheckIn: boolean
  checkInReservation: { adult_count: number; child_count: number } | null
  stayingReservation: { adult_count: number; child_count: number } | null
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

function makeEmptyRows(): CleaningBoardRow[] {
  return CLEANING_BOARD_ROOM_NUMBERS.map((room) => ({
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
  rows: CleaningBoardRow[] = makeEmptyRows(),
  unassignedReservations: UnassignedReservation[] = [],
): CleaningBoardData {
  return { rows, unassignedReservations }
}

// ─────────────────────────────────────────────────────────────────────────────
// デイリーダッシュボード 基本テスト
// ─────────────────────────────────────────────────────────────────────────────

test.describe('デイリーダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await fixDateTo0412(page)
    await login(page, email!, password!)
    // ?date= で Server Component に初期日付を渡す（fixDateTo0412 はクライアント側の getTodayJST() 用）
    await page.goto('/daily-dashboard?date=2026-04-12')
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
})

// ─────────────────────────────────────────────────────────────────────────────
// タイムテーブル 印刷コンテンツ E2E
// ─────────────────────────────────────────────────────────────────────────────

test.describe('タイムテーブル印刷コンテンツ', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await suppressPrint(page)
    await fixDateTo0412(page)
    await login(page, email!, password!)
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    await page.getByTestId('print-timetable').click()
    // data が揃うまで待機（スロットが DOM に現れるのを確認）
    await expect(page.getByTestId('timetable-date')).toContainText('4/12')
  })

  test('印刷エリアに日付と曜日が表示される', async ({ page }) => {
    await expect(page.getByTestId('timetable-date')).toContainText('4/12')
    await expect(page.getByTestId('timetable-date')).toContainText('日')
  })

  test('印刷エリアに曜日チェック欄が表示される', async ({ page }) => {
    await expect(page.getByTestId('weekday-checks')).toContainText('▢ニゴウ情報送信')
    await expect(page.getByTestId('weekday-checks')).toContainText('▢61布団')
    await expect(page.getByTestId('weekday-checks')).toContainText('▢資源ごみ')
  })

  test('印刷エリアのCheckInに㉑・田中太郎・-2が表示される', async ({ page }) => {
    await expect(page.getByTestId('checkin-slot-15:00')).toContainText('㉑')
    await expect(page.getByTestId('checkin-slot-15:00')).toContainText('田中太郎')
    await expect(page.getByTestId('checkin-slot-15:00')).toContainText('-2')
  })

  test('印刷エリアの夕方露天に㉑が表示される', async ({ page }) => {
    await expect(page.getByTestId('evening-bath-slot-16:00')).toContainText('㉑')
  })

  test('印刷エリアの夕食に㉑・田中太郎・-2が表示される', async ({ page }) => {
    await expect(page.getByTestId('dinner-slot-17:30')).toContainText('㉑')
    await expect(page.getByTestId('dinner-slot-17:30')).toContainText('田中太郎')
    await expect(page.getByTestId('dinner-slot-17:30')).toContainText('-2')
  })

  test('印刷エリアのGuestInfoにmemoが表示される', async ({ page }) => {
    await expect(page.getByTestId('guest-info-row-21')).toContainText('memo')
  })

  test('印刷エリアの空室部屋が6件表示される', async ({ page }) => {
    await expect(page.getByTestId('guest-info-vacant')).toHaveCount(6)
  })

  test('印刷エリアの朝食に㉑が表示される', async ({ page }) => {
    await expect(page.getByTestId('breakfast-slot-8:00a')).toContainText('㉑')
  })

  test('印刷エリアに連泊ゲストラベルが表示される', async ({ page }) => {
    await expect(page.getByTestId('staying-guests')).toContainText('㉑')
    await expect(page.getByTestId('staying-guests')).toContainText('1/2泊目')
  })
})

test.describe('タイムテーブル印刷コンテンツ（4/13）', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await suppressPrint(page)
    await fixDateTo0412(page)
    await login(page, email!, password!)
    await page.route('/api/timetable*', async (route) => {
      const url = new URL(route.request().url())
      const date = url.searchParams.get('date')
      route.fulfill({ json: date === '2026-04-13' ? mockFor0413() : mockFor0412() })
    })
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    // 翌日（4/13）に移動してから印刷
    await page.getByTestId('next-day').click()
    await expect(page.getByTestId('date-label')).toContainText('4/13')
    await page.getByTestId('print-timetable').click()
    await expect(page.getByTestId('timetable-date')).toContainText('4/13')
  })

  test('4/13印刷エリアのCheckoutNoticeに㉑が表示される', async ({ page }) => {
    await expect(page.getByTestId('checkout-notice')).toContainText('㉑')
  })

  test('4/13印刷エリアのLateCheckoutに㉑が表示される', async ({ page }) => {
    await expect(page.getByTestId('late-checkout-notice')).toContainText('㉑')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 清掃ボード 印刷コンテンツ E2E
// ─────────────────────────────────────────────────────────────────────────────

test.describe('清掃ボード印刷コンテンツ', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await suppressPrint(page)
    await fixDateTo0412(page)
    await login(page, email!, password!)
  })

  test('印刷エリアに日付ヘッダーが表示される', async ({ page }) => {
    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard() }),
    )
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    await page.getByTestId('print-cleaning-board').click()
    await expect(page.getByTestId('cleaning-board-date')).toContainText('4月12日')
    await expect(page.getByTestId('cleaning-board-date')).toContainText('日')
  })

  test('当日CIの印刷エリアにadult_count(child_count)が表示される', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = { ...rows[0], room: '21', isTodayCheckIn: true, checkInReservation: { adult_count: 2, child_count: 1 } }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    await page.getByTestId('print-cleaning-board').click()
    await expect(page.getByTestId('cleaning-board-date')).toContainText('4月12日')
    await expect(page.getByTestId('ci-cell-21')).toHaveText('2(1)')
  })

  test('未来CIの印刷エリアに括弧付き人数が表示される', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[2] = { ...rows[2], room: '31', isFutureCheckIn: true, checkInReservation: { adult_count: 2, child_count: 1 } }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    await page.getByTestId('print-cleaning-board').click()
    await expect(page.getByTestId('cleaning-board-date')).toContainText('4月12日')
    await expect(page.getByTestId('ci-cell-31')).toHaveText('(2(1))')
  })

  test('連泊継続中の印刷エリアに連泊列が表示される', async ({ page }) => {
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
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    await page.getByTestId('print-cleaning-board').click()
    await expect(page.getByTestId('cleaning-board-date')).toContainText('4月12日')
    await expect(page.getByTestId('consecutive-cell-21')).toHaveText('2(1)')
  })

  test('autoNotesが印刷エリアの備考欄に表示される', async ({ page }) => {
    const rows = makeEmptyRows()
    rows[0] = { ...rows[0], room: '21', autoNotes: ['21: レイトアウト11:00'] }

    await page.route('/api/cleaning-board*', (route) =>
      route.fulfill({ json: mockCleaningBoard(rows) }),
    )
    await page.goto('/daily-dashboard?date=2026-04-12')
    await expect(page.getByTestId('date-label')).toContainText('4/12')

    await page.getByTestId('print-cleaning-board').click()
    await expect(page.getByTestId('cleaning-board-date')).toContainText('4月12日')
    await expect(page.getByTestId('auto-notes-box')).toContainText('21: レイトアウト11:00')
  })
})
