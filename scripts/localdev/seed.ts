// Firebase Emulator へデータを投入する
//   npm run seed               # .localdev/data/ の匿名化データ
//   npm run seed -- --fixture  # tests/fixtures/localdev/ の人工データ
// Emulator は停止するとデータとユーザーを失うので、起動のたびに実行する
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { checkSeedTarget } from './lib/guards'
import type { SeedTarget } from './lib/guards'
import { parseDocumentFile } from './lib/serialize'
import type { StoredDocument } from './lib/serialize'
import {
  ANONYMIZED_DATA_DIR,
  DEV_USER_DISPLAY_NAME,
  DEV_USER_EMAIL,
  DEV_USER_PASSWORD, DEV_USER_MFA_PHONE,
  FIRESTORE_BATCH_LIMIT,
  FIXTURE_DATA_DIR,
  SEED_COLLECTIONS,
} from './constants'

async function main(): Promise<void> {
  // Emulator と demo project でなければ何もしない
  const target = checkSeedTarget(process.env)
  if (!target.success) {
    fail(['投入を中止しました（Emulator 以外には書き込みません）。', ...target.error.map((e) => `  - ${e}`)])
  }
  const { projectId, firestoreHost, authHost } = target.value

  const useFixture = process.argv.includes('--fixture')
  const dataDir = useFixture ? FIXTURE_DATA_DIR : ANONYMIZED_DATA_DIR
  const files = SEED_COLLECTIONS.map((collection) => ({ collection, file: path.join(dataDir, `${collection}.json`) }))
  const missing = files.filter(({ file }) => !existsSync(file))
  if (missing.length > 0) {
    fail([
      `投入するデータがありません: ${missing.map(({ file }) => file).join(', ')}`,
      useFixture ? '' : '  匿名化データを作る（npm run anonymize）か、人工データを使う（npm run seed -- --fixture）。',
    ])
  }

  await assertEmulatorsRunning(target.value)

  // 読み込みと形の検査を先に済ませ、壊れたファイルで Emulator を空にしない
  const app = initializeApp({ projectId })
  const db = getFirestore(app)
  const auth = getAuth(app)
  const datasets = files.map(({ collection, file }) => ({
    collection,
    docs: parseDocumentFile(JSON.parse(readFileSync(file, 'utf8')), (refPath) => db.doc(refPath)),
  }))

  // 全データと全ユーザーを削除する（2回続けて投入しても重複しない）
  await clearEmulators(target.value)

  // 値を変えずに投入する（日付もずらさない。表示範囲外のデータもそのまま）
  for (const { collection, docs } of datasets) {
    await writeAll(db, collection, docs)
  }

  // 開発用ログインユーザー。ログインには SMS の2要素目が要るので、電話を登録しておく（本番の scripts/mfa/enrollPhone.ts と同じ形）
  await auth.createUser({
    email: DEV_USER_EMAIL,
    password: DEV_USER_PASSWORD,
    displayName: DEV_USER_DISPLAY_NAME,
    emailVerified: true,
    multiFactor: { enrolledFactors: [{ factorId: 'phone', phoneNumber: DEV_USER_MFA_PHONE, displayName: 'Emulator' }] },
  })

  console.log(`投入しました（project: ${projectId}, Firestore: ${firestoreHost}, Auth: ${authHost}, データ: ${dataDir}）`)
  for (const { collection } of datasets) {
    const count = (await db.collection(collection).count().get()).data().count
    console.log(`  ${collection}: ${count} 件`)
  }
  console.log(`  開発用ユーザー: ${DEV_USER_EMAIL} / ${DEV_USER_PASSWORD}（SMS のコードは make mfa-code）`)
}

async function assertEmulatorsRunning({ firestoreHost, authHost }: SeedTarget): Promise<void> {
  for (const host of [firestoreHost, authHost]) {
    try {
      await fetch(`http://${host}/`, { signal: AbortSignal.timeout(3000) })
    } catch {
      fail([`Emulator（${host}）に接続できません。先に npm run emulators を実行してください。`])
    }
  }
}

// Emulator 専用の REST エンドポイント。Authorization: Bearer owner は Emulator の管理者扱い
async function clearEmulators({ projectId, firestoreHost, authHost }: SeedTarget): Promise<void> {
  const requests = [
    `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://${authHost}/emulator/v1/projects/${projectId}/accounts`,
  ]
  for (const url of requests) {
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
    if (!res.ok) fail([`Emulator のデータ削除に失敗しました（${res.status} ${url}）`])
  }
}

async function writeAll(db: FirebaseFirestore.Firestore, collection: string, docs: StoredDocument[]): Promise<void> {
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch()
    for (const { id, data } of docs.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
      batch.set(db.collection(collection).doc(id), data)
    }
    await batch.commit()
  }
}

function fail(lines: string[]): never {
  console.error(lines.filter((line) => line !== '').join('\n'))
  process.exit(1)
}

main().catch((e: unknown) => {
  console.error('投入に失敗しました:', e instanceof Error ? e.message : e)
  process.exit(1)
})
