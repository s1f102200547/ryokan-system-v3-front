import { defineConfig, devices } from '@playwright/test'

// 本物のログイン（Auth Emulator）を通す E2E。セッション Cookie の属性が目的どおりに働くか、失効が画面まで効くかを確かめる。
// `npm run e2e:emulator` が firebase emulators:exec で専用の Emulator を起動してから実行する。
// 開発サーバーを 3200 番で起動する（make の開発サーバー 3000 番、本番ビルドの E2E 3100 番と分ける）
const PORT = 3200

// テストのプロセス（firebase-admin でユーザーを作る・失効させる）も Emulator にだけ接続する
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

export default defineConfig({
  testDir: './e2e/emulator',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report-emulator', open: 'never' }]],
  outputDir: 'test-results-emulator',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 攻撃者のサイト（page.route で作るページ）から 127.0.0.1 への移動・送信を、Chrome の Local Network Access が先に止めないようにする
        // （確かめたいのは SameSite で、それと関係なく失敗すると対照実験が成り立たない。playwright.prod.config.ts と同じ）
        launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] },
      },
    },
  ],
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      FIREBASE_PROJECT_ID: 'demo-ryokan',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-ryokan',
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-ryokan.firebaseapp.com',
    },
  },
})
