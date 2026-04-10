import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// ローカル: FIREBASE_PRIVATE_KEY 等の環境変数で認証
// Cloud Run: ADC（Application Default Credentials）で自動認証
const adminApp =
  getApps().length === 0
    ? process.env.FIREBASE_PRIVATE_KEY
      ? initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID, // サーバーサイドでだけ使うので先頭にNEXT_PUBLIC_はつけない
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          }),
        })
      : initializeApp()
    : getApps()[0]

export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
