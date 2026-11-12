import { test, expect, type Page } from '@playwright/test'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createMfaUser, loginFromUi as loginWithCode } from './mfa'

// 1アカウント1セッション（src/lib/auth/loginSession.ts がクレームに最後のログインの時刻を書き、src/lib/auth/verifySession.ts が比べる）。
// 2つのブラウザ（別の PC のつもり）で同じアカウントに入ると、先に入っていた方が次の操作でログイン画面に移る

const APP = 'http://127.0.0.1:3200'
const PASSWORD = 'emutest-password'
const RUN_ID = `emutest-single-${Date.now()}`
// ログインの時刻（auth_time）は秒単位。同じ秒の2回のログインは両方とも通るので、秒をまたがせる
const nextSecond = () => new Promise((r) => setTimeout(r, 1100))

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw new Error('Auth Emulator にだけ接続する')
const adminAuth = getAuth(getApps()[0] ?? initializeApp({ projectId: 'demo-ryokan' }))
const createdUids: string[] = []

test.afterAll(async () => {
  await adminAuth.deleteUsers(createdUids)
})

async function createUser(): Promise<string> {
  const email = `${RUN_ID}-${createdUids.length}@example.com`
  createdUids.push(await createMfaUser(adminAuth, email, PASSWORD))
  return email
}

async function loginFromUi(page: Page, email: string) {
  await loginWithCode(page, `${APP}/login`, email, PASSWORD)
}

test('同じアカウントに別のブラウザで入ると、先のブラウザは次の操作でログイン画面に移る', async ({ browser }) => {
  const email = await createUser()
  const first = await browser.newContext()
  const second = await browser.newContext()
  const firstPage = await first.newPage()
  const secondPage = await second.newPage()

  await loginFromUi(firstPage, email)
  await nextSecond()
  await loginFromUi(secondPage, email)

  const responses: number[] = []
  firstPage.on('response', (r) => { if (r.url().includes('/api/guest-info')) responses.push(r.status()) })
  await firstPage.goto(`${APP}/daily-dashboard`)
  await firstPage.waitForURL('**/login')
  expect(responses).toContain(401)

  // 後から入った方は使い続けられる
  const [guestInfo] = await Promise.all([
    secondPage.waitForResponse((r) => r.url().includes('/api/guest-info')),
    secondPage.goto(`${APP}/daily-dashboard`),
  ])
  expect(guestInfo.status()).toBe(200)
  await expect(secondPage).toHaveURL(/\/daily-dashboard/)

  await first.close()
  await second.close()
})
