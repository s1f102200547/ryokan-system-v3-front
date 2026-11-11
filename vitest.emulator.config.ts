import { defineConfig } from 'vitest/config'
import path from 'path'

// Firestore Emulator に実際に書いて読む往復検査（tests/emulator/）。
// `npm run test:emulator` が firebase emulators:exec で専用の Emulator を起動してから実行する。
// 接続先は 127.0.0.1 の Emulator と demo project だけ。起動ガード（runtimeEnvGuard）も通す
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/emulator/**/*.test.ts'],
    // テスト間で同じ Emulator を使うので、ファイルを並列に実行しない
    fileParallelism: false,
    testTimeout: 30_000,
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
