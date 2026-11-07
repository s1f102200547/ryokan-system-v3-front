import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // e2e/prod/ は本番ビルドに対する E2E（playwright.prod.config.ts）
  testIgnore: ['prod/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    // 開発サーバーは 127.0.0.1 にだけ bind する（package.json の dev）。Cookie もこのホスト名で設定する
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    // Emulator 系の変数と demo project で起動し、起動ガードを通す。
    // API はブラウザ側でモックするため Emulator 本体は起動しない。CI も同じ設定を使う。
    // NEXT_PUBLIC_FIREBASE_API_KEY は Firebase SDK の存在チェックを通すためのダミー値
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
