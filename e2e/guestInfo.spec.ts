import { test, expect, type Page } from '@playwright/test'

async function suppressPrint(page: Page) {
  await page.addInitScript(() => { window.print = () => {} })
}

test.describe('GuestInfo - 予約一覧表示', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await page.goto('/daily-dashboard')
  })

  test('選択日のC/I予約カードが表示される', async ({ page }) => {
    await expect(page.getByTestId('reservation-card').first()).toBeVisible()
  })

  test('キャンセル予約が通常予約の下部に表示される', async ({ page }) => {
    await expect(page.getByTestId('cancelled-section')).toBeVisible()
  })
})

test.describe('GuestInfo - モーダル（auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await page.goto('/daily-dashboard')
  })

  test('予約カードクリックでモーダルが開く', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('C/I前タブ: テキスト入力後にSavedインジケーターが表示される', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByLabel('ゲスト名').fill('テスト太郎')
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 3000 })
  })

  test('C/I後タブ: a_tax_received チェックボックスの変更が自動保存される', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByRole('tab', { name: 'C/I後' }).click()
    await page.getByLabel('受領済み').click()
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 3000 })
  })

  test('モーダルを閉じて再度開いたとき変更が反映されている', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByLabel('ゲスト名').fill('フラッシュ確認')
    await page.getByRole('button', { name: '閉じる' }).click()
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByLabel('ゲスト名')).toHaveValue('フラッシュ確認')
  })
})

test.describe('GuestInfo - キャンセル（非auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await page.goto('/daily-dashboard')
  })

  test('キャンセルダイアログが2段階（確認 → 理由入力）で表示される', async ({ page }) => {
    await page.getByTestId('cancel-button').first().click()
    await expect(page.getByText('キャンセルしますか')).toBeVisible()
    await page.getByRole('button', { name: '続ける' }).click()
    await expect(page.getByLabel('キャンセル理由')).toBeVisible()
  })
})

test.describe('GuestInfo - 新規追加（非auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await page.goto('/daily-dashboard')
  })

  test('＋カードクリックで追加ダイアログが開く', async ({ page }) => {
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('dialog', { name: '新規予約' })).toBeVisible()
  })

  test('必須項目未入力時は作成ボタンが無効', async ({ page }) => {
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('button', { name: '作成' })).toBeDisabled()
  })
})
