import { defineConfig, devices } from '@playwright/test'

// ゲストカードが出るまでの時間を測る（npm run perf）。速くなったかを数値で比べるためのもので、合否は判定しない。
// 時間はマシンの負荷でぶれるので、make check と CI には入れない。
// 本番ビルド（next build → next start）に対して測る。開発サーバーは初回のコンパイルが入り、本番と違うため。
// API はブラウザ側でモックし、決まった遅れで返す（e2e/perf/guestCards.perf.spec.ts）。
// 本番ビルドは 23:00〜6:00 JST に全ページを /time-restricted に回すので、利用時間内に実行する
const PORT = 3300

export default defineConfig({
  testDir: './e2e/perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 1つのテストで同じ場面を何度も測るので長めにする
  timeout: 180_000,
  reporter: [['list']],
  outputDir: 'test-results-perf',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build && npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    // 古いビルドで測らないよう、毎回ビルドし直す
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
