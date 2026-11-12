import type { Page } from '@playwright/test'
import type { Auth } from 'firebase-admin/auth'

// 本物のログイン（Auth Emulator）を画面から通すための道具。ログインは パスワード → SMS のコード の2段。
// Emulator は SMS を送らず、コードを REST（/emulator/v1/projects/{id}/verificationCodes）で返す

// Emulator 用の電話番号（555 は架空の番号の帯）
export const EMULATOR_MFA_PHONE = '+15555550100'

// 電話を2要素目に登録したユーザーを作る（本番の scripts/mfa/enrollPhone.ts と同じ形）
export async function createMfaUser(adminAuth: Auth, email: string, password: string): Promise<string> {
  const user = await adminAuth.createUser({
    email,
    password,
    emailVerified: true,
    multiFactor: { enrolledFactors: [{ factorId: 'phone', phoneNumber: EMULATOR_MFA_PHONE, displayName: 'emutest' }] },
  })
  // Emulator はユーザーを作った秒を tokensValidAfterTime にし、それより前の auth_time のトークンを失効扱いにする。
  // WSL の時計は約1秒戻ることがあり（2026-11-12 に開発サーバーのログの時刻が戻るのを観察）、直後のログインが auth/id-token-revoked で落ちた。
  // 作った秒をまたいでから返す
  await new Promise((r) => setTimeout(r, 1100))
  return user.uid
}

// 最後に送ったコード。テストは1つずつ順に動く（workers: 1）ので、最後のものがこのテストのもの
export async function latestSmsCode(): Promise<string> {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-ryokan/verificationCodes`)
  const body = (await res.json()) as { verificationCodes?: { phoneNumber?: string; code?: string }[] }
  const code = body.verificationCodes?.filter((c) => c.phoneNumber === EMULATOR_MFA_PHONE).at(-1)?.code
  if (!code) throw new Error(`Emulator に SMS のコードがない（status ${res.status}）`)
  return code
}

// 1段目（パスワード）だけ。コードの入力欄が出るまで待つ
export async function submitPassword(page: Page, email: string, password: string) {
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード').fill(password)
  await page.getByRole('button', { name: 'ログイン' }).click()
}

// 画面からログインする（パスワード → SMS のコード → ダッシュボード）
export async function loginFromUi(page: Page, url: string, email: string, password: string) {
  await page.goto(url)
  await submitPassword(page, email, password)
  await page.getByLabel('確認コード').waitFor()
  await page.getByLabel('確認コード').fill(await latestSmsCode())
  await page.getByRole('button', { name: '確認' }).click()
  await page.waitForURL('**/daily-dashboard**')
}
