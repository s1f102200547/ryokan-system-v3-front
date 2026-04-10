import { test, expect } from '@playwright/test'

// Firebase Auth が呼ぶ REST エンドポイント群
// signInWithEmailAndPassword は identitytoolkit + securetoken の複数エンドポイントを叩く
const FIREBASE_IDENTITY_URL = '**/identitytoolkit.googleapis.com/**'
const FIREBASE_SECURETOKEN_URL = '**/securetoken.googleapis.com/**'

// Firebase Client SDK は getIdToken() 内部で JWT を base64url パースして exp を確認する
function makeFakeIdToken(): string {
  const toBase64Url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const header = toBase64Url({ alg: 'RS256', typ: 'JWT' })
  const payload = toBase64Url({
    iss: 'https://securetoken.google.com/test-project',
    aud: 'test-project',
    sub: 'mock-uid',
    uid: 'mock-uid',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'test@example.com',
    firebase: { identities: {}, sign_in_provider: 'password' },
  })
  return `${header}.${payload}.fakesig`
}

test.describe('ログイン', () => {
  test('/ にアクセスするとログインページへリダイレクトされる', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/login')
  })

  test('ログインページにフォームが表示される', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('メールアドレス')).toBeVisible()
    await expect(page.getByLabel('パスワード')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible()
  })

  test('誤った認証情報でログインするとエラーメッセージが表示される', async ({ page }) => {
    // identitytoolkit の signInWithPassword を credential エラーで返す
    await page.route(FIREBASE_IDENTITY_URL, (route) =>
      route.fulfill({
        status: 400,
        json: { error: { code: 400, message: 'INVALID_PASSWORD' } },
      }),
    )

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill('wrong@example.com')
    await page.getByLabel('パスワード').fill('wrongpassword')
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(
      page.getByText('メールアドレスまたはパスワードが正しくありません')
    ).toBeVisible()
  })

  test('正しい認証情報でログインすると / に遷移する', async ({ page }) => {
    const fakeIdToken = makeFakeIdToken()

    // Firebase が呼ぶ全エンドポイントをまとめてモック（おおまかに）
    // identitytoolkit: signInWithPassword, getAccountInfo 等
    await page.route(FIREBASE_IDENTITY_URL, (route) =>
      route.fulfill({
        status: 200,
        json: {
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: 'mock-uid',
          email: 'test@example.com',
          idToken: fakeIdToken,
          refreshToken: 'mock-refresh-token',
          expiresIn: '3600',
          registered: true,
          // getAccountInfo 用フィールドも含める
          users: [{ localId: 'mock-uid', email: 'test@example.com' }],
        },
      }),
    )

    // securetoken: getIdToken() がトークン更新のために呼ぶ可能性がある
    await page.route(FIREBASE_SECURETOKEN_URL, (route) =>
      route.fulfill({
        status: 200,
        json: {
          access_token: fakeIdToken,
          expires_in: '3600',
          token_type: 'Bearer',
          refresh_token: 'mock-refresh-token',
          id_token: fakeIdToken,
          user_id: 'mock-uid',
          project_id: 'test-project',
        },
      }),
    )

    // サーバー側: idToken を受け取り Session Cookie を発行する
    await page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Set-Cookie': 'session=mock-session; Path=/; HttpOnly; SameSite=Strict' },
        json: { success: true },
      }),
    )

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill('test@example.com')
    await page.getByLabel('パスワード').fill('password')
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(page).toHaveURL('/')
  })
})
