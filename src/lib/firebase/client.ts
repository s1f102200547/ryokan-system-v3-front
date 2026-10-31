import { initializeApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import type { Auth } from 'firebase/auth'

// firebaseアプリを初期化

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, //client側で使うのでNEXT_PUBLIC_をつける
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
}

// 既に初期化済みなら再利用（Next.js の HMR で二重初期化を防ぐ）
export const firebaseApp = getApps().length === 0 //firebaseインスタンス数が0なら
  ? initializeApp(firebaseConfig) // 初期化してインスタンスを新規作成
  : getApps()[0] // すでにあるインスタンスを使う

// Auth はすべてここを経由する（DEV-4: サーバーとブラウザで接続先を揃える）
// 読み込み時ではなく最初に使うときに初期化する（API キー未設定の build や SSR で throw させないため）
export function getFirebaseAuth(): Auth {
  const auth = getAuth(firebaseApp)
  // development のときだけ Auth Emulator に接続する。
  // production build では NODE_ENV がインライン化され、この分岐ごと消える
  const authEmulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST
  if (process.env.NODE_ENV === 'development' && authEmulatorHost && !auth.emulatorConfig) {
    connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true })
  }
  return auth
}
