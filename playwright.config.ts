import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'fs'

// .env.test.local から TEST_EMAIL / TEST_PASSWORD を読み込む
try {
  readFileSync('.env.test.local', 'utf8')
    .split('\n')
    .forEach((line) => {
      const [key, ...rest] = line.split('=')
      if (key?.trim()) process.env[key.trim()] = rest.join('=').trim()
    })
} catch { /* ファイルがなければスキップ */ }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
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
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
