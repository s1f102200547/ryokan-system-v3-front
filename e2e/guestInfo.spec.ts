import { test, expect, type Page } from '@playwright/test'

async function suppressPrint(page: Page) {
  await page.addInitScript(() => { window.print = () => {} })
}

const SAMPLE_RESERVATION = {
  id: 'test-id-1',
  guest_name: 'テスト太郎',
  room: '21',
  check_in_date: '2026-01-01',
  check_out_date: '2026-01-02',
  adult_count: 2,
  child_count: 0,
  cancel: 0,
  late_out: 0,
  arrival_time: null,
  dinner_time: ['NONE'],
  dinner_info: [''],
  breakfast_time: [null],
  open_air_bath_time: [null],
  timetable_info: [''],
  reservation_number: 'test-rsv-001',
  booking_site: 'other',
  mail_memo: [],
  a_tax_received: false,
  a_tax_received_by_staff_name: '',
  check_in_staff_name: '',
  country: null,
  city: '',
  age_groups: [null, null],
  group_type: null,
  purpose: null,
  tourism_type: null,
  profession: '',
  other_note: '',
}

const CANCELLED_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-2',
  room: '22',
  cancel: 1,
}

const LATE_ROOM_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-3',
  guest_name: '先に返された予約',
  room: '43',
  arrival_time: '20:00',
}

const EARLY_ROOM_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-4',
  guest_name: '後に返された予約',
  room: '21',
  arrival_time: '15:00',
}

const STAYING_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-5',
  guest_name: '連泊花子',
  room: '61',
  check_in_date: '2025-12-31',
  check_out_date: '2026-01-02',
}

async function setupAuth(page: Page) {
  await page.context().addCookies([{
    name: 'session',
    value: 'mock-session',
    domain: 'localhost',
    path: '/',
  }])
}

async function mockGuestInfoApi(page: Page) {
  await page.route('/api/guest-info*', (route) => route.fulfill({
    status: 200,
    json: { normal: [SAMPLE_RESERVATION], staying: [], cancelled: [CANCELLED_RESERVATION] },
  }))
  await page.route('**/api/daily/**/todos', (route) => route.fulfill({
    status: 200,
    json: { todos: [] },
  }))
  await page.route('/api/a-tax-table*', (route) => route.fulfill({
    status: 200,
    json: { rows: [], safeBalanceCheckers: {} },
  }))
  await page.route('**/api/reservations/**', (route) => route.fulfill({ status: 200, json: {} }))
  await page.route('**/api/reservations/*', (route) => route.fulfill({ status: 200, json: {} }))
}

test.describe('GuestInfo - 予約一覧表示', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('選択日のC/I予約カードが表示される', async ({ page }) => {
    await expect(page.getByTestId('reservation-card').first()).toBeVisible()
  })

  test('キャンセル済み予約セクションが表示され復活ボタンは表示されない', async ({ page }) => {
    await expect(page.getByTestId('cancelled-section')).toBeVisible()
    await expect(page.getByTestId('restore-button')).not.toBeVisible()
  })

  test('不要な宿泊税表示と遷移ボタンは表示されない', async ({ page }) => {
    await expect(page.getByText('宿泊税締め担当')).not.toBeVisible()
    await expect(page.getByRole('link', { name: '宿泊税管理' })).not.toBeVisible()
  })

  test('画面切り替えボタンが表示され宿泊税ページへ遷移できる', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ダッシュボード' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '宿泊税' })).toBeVisible()

    await page.getByRole('button', { name: '宿泊税' }).click()
    await expect(page).toHaveURL('/a_tax_table')
  })

  test('トグル切り替えで予約カードを並び替えず連泊を常時表示する', async ({ page }) => {
    await page.route('/api/guest-info*', (route) => route.fulfill({
      status: 200,
      json: {
        normal: [LATE_ROOM_RESERVATION, EARLY_ROOM_RESERVATION],
        staying: [STAYING_RESERVATION],
        cancelled: [],
      },
    }))

    await page.goto('/daily-dashboard?date=2026-01-01&today=2026-01-01')
    await expect(page.getByTestId('reservation-card')).toHaveCount(3)
    await expect(page.getByTestId('reservation-card').nth(0)).toContainText('43')
    await expect(page.getByTestId('reservation-card').nth(1)).toContainText('21')
    await expect(page.getByTestId('reservation-card').nth(2)).toContainText('連泊')

    await page.getByRole('button', { name: '到着' }).click()
    await expect(page.getByTestId('reservation-card').nth(0)).toContainText('43')
    await expect(page.getByTestId('reservation-card').nth(1)).toContainText('21')
    await expect(page.getByTestId('reservation-card').nth(2)).toContainText('連泊')
  })
})

test.describe('GuestInfo - モーダル（auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('予約カードクリックでモーダルが開く', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('C/I前タブ: テキスト入力後にSavedインジケーターが表示される', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByText('name').first().click()
    await page.getByLabel('ゲスト名').fill('test taro')
    await page.keyboard.press('Tab')  // blur → onBlurFlush → debounce flush
    await expect(page.locator('[data-testid="save-status"][data-status="saved"]')).toBeVisible({ timeout: 3000 })
  })

  test('C/I後タブ: a_tax_received チェックボックスの変更が自動保存される', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByRole('button', { name: 'C/I後' }).click()
    await page.getByLabel('未受領').click()
    await expect(page.locator('[data-testid="save-status"][data-status="saved"]')).toBeVisible({ timeout: 3000 })
  })

  test('モーダルを閉じて再度開いたとき変更が反映されている', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByText('name').first().click()
    await page.getByLabel('ゲスト名').fill('フラッシュ確認')
    await page.getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})

test.describe('GuestInfo - キャンセル（非auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('キャンセルダイアログが開き理由入力欄が表示される', async ({ page }) => {
    await page.getByTestId('cancel-button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('キャンセル理由')).toBeVisible()
  })
})

test.describe('GuestInfo - 新規追加（非auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('＋カードクリックで追加ダイアログが開く', async ({ page }) => {
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('dialog', { name: /新規予約/ })).toBeVisible()
  })

  test('必須項目未入力時は追加ボタンが無効', async ({ page }) => {
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('button', { name: '追加' })).toBeDisabled()
  })
})
