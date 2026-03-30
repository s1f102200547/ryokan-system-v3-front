import { initializeApp, getApps } from 'firebase/app'

// firebaseアプリを初期化

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
}

// 既に初期化済みなら再利用（Next.js の HMR で二重初期化を防ぐ）
export const firebaseApp = getApps().length === 0 //firebaseインスタンス数が0なら
  ? initializeApp(firebaseConfig) // 初期化してインスタンスを新規作成
  : getApps()[0] // すでにあるインスタンスを使う
