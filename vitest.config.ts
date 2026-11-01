import { defineConfig } from 'vitest/config'
import path from 'path'

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
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:1',
      FIREBASE_PROJECT_ID: 'demo-test',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-test',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
})
