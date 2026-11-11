import { test, expect, type Page } from '@playwright/test'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// ログインの失敗回数の制限を、画面から本物のログイン（Auth Emulator・Firestore Emulator）で確かめる。
// 3回間違えると止まり、正しいパスワードでも入れない（src/domain/auth/loginThrottle.ts）

const APP = 'http://127.0.0.1:3200'
const PASSWORD = 'emutest-password'
const RUN_ID = `emutest-lock-${Date.now()}`

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Auth Emulator にだけ接続する')
if (!process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Firestore Emulator にだけ接続する')
const app = getApps()[0] ?? initializeApp({ projectId: 'demo-ryokan' })
const adminAuth = getAuth(app)
const db = getFirestore(app)
const createdUids: string[] = []

// 開発サーバーには X-Forwarded-For が付かず、ほかのテストのログインも同じ IP（unknown）で数えられる。残さない
test.afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
  await db.recursiveDelete(db.collection('loginThrottle'))
})

async function submit(page: Page, email: string, password: string) {
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}

test('3回間違えると止まり、正しいパスワードでも「あと M:SS」と出てログインできない', async ({ browser }) => {
  const email = `${RUN_ID}@example.com`
  const user = await adminAuth.createUser({ email, password: PASSWORD })
  createdUids.push(user.uid)
  // このテストだけの接続元（IP の回数をほかのテストと分ける）
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.250' } })
  const page = await context.newPage()
  await page.goto(`${APP}/login`)

  for (let i = 0; i < 3; i++) {
    await submit(page, email, 'wrong-password')
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  }

  await submit(page, email, PASSWORD)
  await expect(page.getByText(/ログインの失敗が続いたため、あと [01]:\d\d はログインできません/)).toBeVisible()
  expect(page.url()).toContain('/login')
  expect((await context.cookies(APP)).find((c) => c.name === 'session')).toBeUndefined()
  await context.close()
})
