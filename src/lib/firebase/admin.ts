import { getApps, initializeApp } from 'firebase-admin/app'
import type { App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { assertRuntimeEnv } from '@/lib/firebase/runtimeEnvGuard'

// development / test: Emulator にだけ接続する。認証情報は渡さない（ADC へも fallback しない）
//   接続先は FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST を SDK が読む
// production（Cloud Run）: ADC（Application Default Credentials）で自動認証
// 起動条件を満たさなければ初期化せずに throw する（instrumentation.ts をすり抜けた場合の fail closed）
function createAdminApp(): App {
  const mode = assertRuntimeEnv()
  return mode === 'emulator'
    ? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }) // サーバーサイドでだけ使うので先頭にNEXT_PUBLIC_はつけない
    : initializeApp()
}

const adminApp = getApps()[0] ?? createAdminApp()

export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
