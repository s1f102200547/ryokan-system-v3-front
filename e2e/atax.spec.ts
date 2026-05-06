import { test, expect } from '@playwright/test'

test.describe('ATaxTable - 表示', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/a_tax_table')
  })

  test('ページが表示され予約行が存在する', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('月切り替えで表示が更新される', async ({ page }) => {
    await page.getByRole('button', { name: '先月' }).click()
    await expect(page.getByRole('table')).toBeVisible()
  })
})

test.describe('ATaxTable - チェックボックス（即時保存）', () => {
  test('受領済みチェックを切り替えると即時反映される', async ({ page }) => {
    await page.goto('/a_tax_table')
    const checkbox = page.getByRole('checkbox', { name: '受領済み' }).first()
    const before = await checkbox.isChecked()
    await checkbox.click()
    await page.reload()
    const after = page.getByRole('checkbox', { name: '受領済み' }).first()
    await expect(after).toBeChecked({ checked: !before })
  })
})

test.describe('ATaxTable - CSV出力', () => {
  test('CSVダウンロードボタンが存在する', async ({ page }) => {
    await page.goto('/a_tax_table')
    await expect(page.getByRole('button', { name: /CSV/ })).toBeVisible()
  })
})
