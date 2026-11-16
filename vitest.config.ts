import { defineConfig } from 'vitest/config'
import path from 'path'
import { AUTH_COVERAGE_TARGETS } from './vitest.coverageTargets'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup/setup.ts'],
    globals: true,
    // tests/emulator/ は Emulator に接続する往復検査。vitest.emulator.config.ts で別に実行する
    exclude: ['**/node_modules/**', '**/e2e/**', 'tests/emulator/**'],
    // Emulator 経路で初期化し、接続先を到達不能なアドレスにする。
    // 誤って Firestore / Auth を呼ぶテストは本番にも ADC にも届かず、すぐ失敗する
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:1',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:1',
      FIREBASE_PROJECT_ID: 'demo-test',
    },
    // --coverage のときだけ（npm run coverage:auth）。普段の npm run test では測らない
    coverage: {
      provider: 'v8',
      include: AUTH_COVERAGE_TARGETS,
      reporter: ['text', 'json'],
      reportsDirectory: 'coverage/unit',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
})
