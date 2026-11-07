import { defineConfig, devices } from '@playwright/test'

// 本番ビルド（next build → next start）に対する E2E。セキュリティヘッダーと CSP を本番と同じ値で確かめる。
// 開発サーバー（playwright.config.ts）は CSP に 'unsafe-eval' が入るなど本番と違うので、こちらで分ける。
// Emulator 系の変数は渡さない（起動ガードは production の規則で通る。CI の ZAP のジョブと同じ）。API はブラウザ側でモックする。
// 本番は 23:00〜6:00 JST に全ページを /time-restricted に回すので、テストはどの時刻でも成り立つように書く
const PORT = 3100

export default defineConfig({
  testDir: './e2e/prod',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report-prod', open: 'never' }]],
  outputDir: 'test-results-prod',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Permissions-Policy の対照実験で、ヘッダーを外せばカメラ・マイクが使えることを見るため、偽の機器を使い許可の確認を省く
            '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            // 攻撃者のサイト（page.route で作るページ）から 127.0.0.1 への読み込みを、Chrome の Local Network Access が先に止める。
            // 確かめたいヘッダー（CORP など）と関係なく失敗して対照実験が成り立たないので、この E2E のブラウザでだけ無効にする
            '--disable-features=LocalNetworkAccessChecks',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    // 既に動いているサーバー（古いビルド）でテストしないよう、毎回ビルドし直す。ポートが使われていれば失敗する
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
