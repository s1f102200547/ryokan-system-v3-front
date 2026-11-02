// Firestore Security Rules の検査（T6-2。firestore.rules）
// ブラウザと同じ Client SDK（firebase）から、ログインしていてもいなくても、読み書きがすべて拒否されることを確かめる。
// サーバーは Admin SDK を使い、ルールの影響を受けない（既存のドキュメントは Admin SDK で作り、片付ける）。
// Emulator は firebase.json の firestore.rules を読み込んで起動する（npm run test:emulator）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { deleteApp, initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, terminate, updateDoc,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { adminDb } from '@/lib/firebase/admin'

const RUN_ID = `rulestest-${Date.now()}`
// アプリが使うコレクションと、まだないコレクション（ルールの {document=**} がすべてに効くことを確かめる）
const COLLECTIONS = ['guestInfoV2', 'dailyInfo', 'notExistingCollection'] as const
const EXISTING_ID = `${RUN_ID}-existing`
const NEW_ID = `${RUN_ID}-new`

let app: FirebaseApp
let auth: Auth
let db: Firestore

// 失敗の理由がルールによる拒否であることまで確かめる（接続の失敗などで通らないように）
async function expectDenied(op: Promise<unknown>): Promise<void> {
  await expect(op).rejects.toMatchObject({ code: 'permission-denied' })
}

function describeDeniedOperations() {
  describe.each(COLLECTIONS)('%s', (name) => {
    it('既存のドキュメントを読めない', async () => {
      await expectDenied(getDoc(doc(db, name, EXISTING_ID)))
    })

    it('コレクションを一覧できない', async () => {
      await expectDenied(getDocs(collection(db, name)))
    })

    it('新しいドキュメントを作れない', async () => {
      await expectDenied(setDoc(doc(db, name, NEW_ID), { by: 'client' }))
    })

    it('既存のドキュメントを更新できない', async () => {
      await expectDenied(updateDoc(doc(db, name, EXISTING_ID), { by: 'client' }))
    })

    it('既存のドキュメントを削除できない', async () => {
      await expectDenied(deleteDoc(doc(db, name, EXISTING_ID)))
    })
  })
}

beforeAll(async () => {
  app = initializeApp(
    { projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY },
    RUN_ID,
  )
  auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  db = getFirestore(app)
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':')
  connectFirestoreEmulator(db, host, Number(port))

  await Promise.all(COLLECTIONS.map((name) => adminDb.collection(name).doc(EXISTING_ID).set({ by: 'admin' })))
})

afterAll(async () => {
  await auth.currentUser?.delete()
  await terminate(db)
  await deleteApp(app)
  await Promise.all(
    COLLECTIONS.flatMap((name) => [
      adminDb.collection(name).doc(EXISTING_ID).delete(),
      adminDb.collection(name).doc(NEW_ID).delete(),
    ]),
  )
})

describe('Firestore Security Rules: ログインしていない Client SDK', () => {
  beforeAll(async () => {
    await signOut(auth)
  })

  describeDeniedOperations()
})

describe('Firestore Security Rules: ログインした Client SDK', () => {
  beforeAll(async () => {
    await createUserWithEmailAndPassword(auth, `${RUN_ID}@example.com`, 'rules-test-password')
  })

  describeDeniedOperations()
})

describe('Firestore Security Rules: Admin SDK（サーバー）', () => {
  it('ルールの影響を受けずに読み書きできる', async () => {
    const ref = adminDb.collection('guestInfoV2').doc(EXISTING_ID)
    await ref.set({ by: 'admin-updated' })
    const snap = await ref.get()
    expect(snap.data()).toEqual({ by: 'admin-updated' })
  })
})
