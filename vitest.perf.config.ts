import { defineConfig } from 'vitest/config'
import path from 'path'

// ログインの時間と、同じ回線の PC が同時にログインしたときの通り方を測る（npm run perf:mfa。docs/MfaBugHunt.md の S13）。
// 合否は判定しない。時間はマシンの負荷でぶれるので、make check・CI（test:emulator）には入れない。
// firebase emulators:exec で専用の Emulator を起動してから実行する。結果は perf-results/（Git の対象外）
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.perf.ts'],
    fileParallelism: false,
    testTimeout: 600_000,
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_PROJECT_ID: 'demo-ryokan',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
})
