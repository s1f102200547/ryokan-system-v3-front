import { test, expect, type Page } from '@playwright/test'

// ATaxTableRow = Reservation & { nights, tax }
const SAMPLE_ROW = {
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
  booking_site: 'booking.com',
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
  nights: 1,
  tax: 400,
}

const CANCELLED_ROW = {
  ...SAMPLE_ROW,
  id: 'test-id-cancelled',
  guest_name: 'キャンセル花子',
  room: '22',
  cancel: 1,
  a_tax_received: true,
  a_tax_received_by_staff_name: '除外スタッフ',
  tax: 1800,
}

const CHILLNN_ROW = {
  ...SAMPLE_ROW,
  id: 'test-id-chillnn',
  guest_name: 'チルン太郎',
  room: '31',
  booking_site: 'chillnn',
  a_tax_received: false,
  tax: 400,
}

async function setupAuth(page: Page) {
  await page.context().addCookies([{
    name: 'session',
    value: 'mock-session',
    domain: 'localhost',
    path: '/',
  }])
}

async function mockATaxApi(page: Page) {
  await page.route('/api/a-tax-table*', (route) => route.fulfill({
    status: 200,
    json: { rows: [SAMPLE_ROW, CANCELLED_ROW, CHILLNN_ROW], safeBalanceCheckers: {} },
  }))
  await page.route('**/api/reservations/*/a-tax', (route) => route.fulfill({ status: 200, json: {} }))
}

test.describe('ATaxTable - 表示', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
    await mockATaxApi(page)
    await page.goto('/a_tax_table')
  })

  test('ページが表示され予約行が存在する', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('キャンセル済み予約は表示と集計から除外される', async ({ page }) => {
    await expect(page.getByText('キャンセル花子')).not.toBeVisible()
    await expect(page.getByText('受領済み合計: ¥0')).toBeVisible()
  })

  test('Chillnn予約も宿泊税金額を表示する', async ({ page }) => {
    const chillnnRow = page.getByRole('row').filter({ hasText: 'チルン太郎' })
    await expect(chillnnRow).toContainText('¥400')
    await expect(chillnnRow).not.toContainText('免除')
  })

  test('宿泊税切り替えボタンが選択状態で表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: '宿泊税' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'ダッシュボード' })).toBeVisible()
    await expect(page.getByRole('link', { name: '← ダッシュボード' })).not.toBeVisible()
  })

  test('月切り替えで表示が更新される', async ({ page }) => {
    // MonthSelector の最初のボタン（先月）をクリック
    await page.getByRole('button', { name: /月/ }).first().click()
    await expect(page.getByRole('table')).toBeVisible()
  })
})

test.describe('ATaxTable - チェックボックス（即時保存）', () => {
  test('受領済みチェックを切り替えると楽観的UIが即時反映される', async ({ page }) => {
    await setupAuth(page)
    await mockATaxApi(page)
    await page.goto('/a_tax_table')
    const checkbox = page.getByRole('checkbox').first()
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()
    await checkbox.click()
    await expect(checkbox).toBeChecked()
  })
})

test.describe('ATaxTable - CSV出力', () => {
  test('CSVダウンロードボタンは先月表示時に表示される', async ({ page }) => {
    await setupAuth(page)
    await mockATaxApi(page)
    await page.goto('/a_tax_table')
    // 先月ボタンをクリックしてCSVボタンを表示させる
    await page.getByRole('button', { name: /月/ }).first().click()
    await expect(page.getByRole('button', { name: /CSV/ })).toBeVisible()
  })
})
