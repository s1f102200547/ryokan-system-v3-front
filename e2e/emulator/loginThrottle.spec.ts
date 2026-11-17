import { test, expect, type Page } from '@playwright/test'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { createMfaUser, latestSmsCode, loginFromUi } from './mfa'

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
  for (const c of ['loginThrottle', 'mfaPending', 'mfaSmsQuota']) await db.recursiveDelete(db.collection(c))
})

async function submit(page: Page, email: string, password: string) {
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}

// [F-20] 止め始めた3回目の応答で「あと M:SS」を出す（前は4回目の正しいパスワードで初めて出ていた）
test('3回目の間違いで止まり、その場で「あと M:SS」と出て、ログインのボタンを押せない', async ({ browser }) => {
  const email = `${RUN_ID}@example.com`
  createdUids.push(await createMfaUser(adminAuth, email, PASSWORD))
  // このテストだけの接続元（IP の回数をほかのテストと分ける）
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.250' } })
  const page = await context.newPage()
  await page.goto(`${APP}/login`)

  for (let i = 0; i < 2; i++) {
    await submit(page, email, 'wrong-password')
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  }

  await submit(page, email, 'wrong-password')
  await expect(page.getByText(/ログインの失敗が続いたため、あと [01]:\d\d はログインできません/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'ログイン' })).toBeDisabled()
  expect(page.url()).toContain('/login')
  expect((await context.cookies(APP)).find((c) => c.name === 'session')).toBeUndefined()
  await context.close()
})

// [F-20] 3回目の誤りの応答で止まったことを伝える（「コードが正しくありません」だけで、4回目の正しいコードが断られていた）
test('SMS のコードを3回間違えると、その場で「あと M:SS」と出て、正しいコードでも入れない', async ({ browser }) => {
  const email = `${RUN_ID}-code@example.com`
  createdUids.push(await createMfaUser(adminAuth, email, PASSWORD))
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.251' } })
  const page = await context.newPage()
  await page.goto(`${APP}/login`)
  await submit(page, email, PASSWORD)
  await page.getByLabel('確認コード').waitFor()
  const code = await latestSmsCode()
  const wrong = code === '000000' ? '111111' : '000000'

  // 6桁入れると画面がボタンなしで送る。違えばマスを空にして打ち直せる状態に戻る
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('確認コード').fill(wrong)
    await expect(page.getByText('コードが正しくありません')).toBeVisible()
    await expect(page.getByLabel('確認コード')).toHaveValue('')
    await expect(page.getByLabel('確認コード')).toBeEditable()
  }
  await page.getByLabel('確認コード').fill(wrong)
  await expect(page.getByText(/ログインの失敗が続いたため、あと [01]:\d\d はログインできません/)).toBeVisible()
  await expect(page.getByText('コードが正しくありません')).toBeHidden()
  expect((await context.cookies(APP)).find((c) => c.name === 'session')).toBeUndefined()
  await context.close()
})

test('正しいコードなら、途中で間違えていてもダッシュボードへ', async ({ browser }) => {
  const email = `${RUN_ID}-retry@example.com`
  createdUids.push(await createMfaUser(adminAuth, email, PASSWORD))
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.252' } })
  const page = await context.newPage()
  await page.goto(`${APP}/login`)
  await submit(page, email, PASSWORD)
  await page.getByLabel('確認コード').waitFor()
  const code = await latestSmsCode()
  await page.getByLabel('確認コード').fill(code === '000000' ? '111111' : '000000')
  await expect(page.getByText('コードが正しくありません')).toBeVisible()
  await expect(page.getByLabel('確認コード')).toHaveValue('')
  await page.getByLabel('確認コード').fill(code)
  await page.waitForURL('**/daily-dashboard**')
  await context.close()
})

test('loginFromUi（ほかのテストの道具）で入れる', async ({ page }) => {
  const email = `${RUN_ID}-helper@example.com`
  createdUids.push(await createMfaUser(adminAuth, email, PASSWORD))
  await loginFromUi(page, `${APP}/login`, email, PASSWORD)
})
