import { test, expect, devices } from '@playwright/test'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

// ログインはWindowsの Chrome・Edge だけ（src/lib/auth/clientCheck.ts）。本物のログイン（Auth Emulator）で確かめる。
// このプロジェクトの既定（devices['Desktop Chrome']）は Windows の Chrome を名乗るので、対照として同じ手順で通ることも見る

const APP = 'http://127.0.0.1:3200'
const PASSWORD = 'emutest-password'
const RUN_ID = `emutest-client-${Date.now()}`
const LINUX_CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Auth Emulator にだけ接続する')
const adminAuth = getAuth(getApps()[0] ?? initializeApp({ projectId: 'demo-ryokan' }))
const createdUids: string[] = []

test.afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
})

async function createUser(): Promise<string> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  const user = await adminAuth.createUser({ email, password: PASSWORD })
  createdUids.push(user.uid)
  return email
}

test('Windows の Chrome（既定）ならログインできる', async ({ page }) => {
  expect(devices['Desktop Chrome'].userAgent).toContain('Windows')
  const email = await createUser()
  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.waitForURL('**/daily-dashboard**')
})

test('Linux の Chrome は、パスワードが合っていても断られ、Cookie も発行されない', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: LINUX_CHROME })
  const page = await context.newPage()
  const email = await createUser()
  await page.goto(`${APP}/login`)
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await expect(page.getByText('この PC・ブラウザからはログインできません')).toBeVisible()
  expect(page.url()).toContain('/login')
  expect((await context.cookies(APP)).find((c) => c.name === 'session')).toBeUndefined()
  await context.close()
})
