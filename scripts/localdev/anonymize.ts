// 本番 Firestore を読み取り、匿名化データを作る（docs/LocalDevelopment.md §4.3 ANON-5〜11）
// 認証の取得と後片付けは anonymize.sh が行う。直接は実行せず `npm run anonymize -- --project <ID> --sa <SA>` を使う
//
//   --project <ID>   本番の project ID（閲覧専用 SA の権限で全件を読み取る）
//   --source <dir>   テスト用: 本番の代わりに保存形式のファイル（<コレクション>.json）を読む
//   --out <dir>      出力先（既定: .localdev）。data/ と reports/ を作る
//
// 変換前のデータはメモリ上だけで扱い、ファイル・ログ・例外メッセージに出さない（ANON-7）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { DEMO_PROJECT_PREFIX } from '@/constants/runtimeEnv'
import { checkAnonymizeEnv } from './lib/guards'
import { cryptoRng } from './lib/rng'
import { serializeDocuments } from './lib/serialize'
import type { JsonValue } from './lib/serialize'
import { buildShapeReport, diffShapeReports } from './lib/shapeReport'
import type { ShapeReport } from './lib/shapeReport'
import { isJsonObject } from './lib/tagged'
import { anonymizeCollections, checkPreserved } from './lib/transform'
import type { CollectionDocuments, JsonDocument } from './lib/transform'
import { SEED_COLLECTIONS } from './constants'

const SCRIPT_VERSION = 1

type Options = { project?: string; source?: string; out: string }

async function main(): Promise<void> {
  // ANON-5: Emulator 系の変数がある環境では何もしない
  const envCheck = checkAnonymizeEnv(process.env)
  if (!envCheck.success) fail(['匿名化を中止しました。', ...envCheck.error.map((e) => `  - ${e}`)])

  const options = parseArgs(process.argv.slice(2))
  const input = options.source !== undefined ? readFromDirectory(options.source) : await readFromFirestore(options.project)

  // 変換（メモリ上）
  const output = anonymizeCollections(input, cryptoRng)

  // AC-19 の自己検査: 日付と部屋が変わっていないこと。件数だけを出す
  const checks = checkPreserved(input, output)
  for (const c of checks) console.log(`自己検査（日付・部屋）: ${c.collection} ${c.checked - c.mismatched}/${c.checked} 一致`)
  if (checks.some((c) => c.mismatched > 0)) fail(['日付または部屋が変換で変わりました。出力を書かずに中止します。'])

  // ディスクに書くのは匿名化後のデータとレポートだけ（ANON-7, ANON-8）
  const dataDir = path.join(options.out, 'data')
  const reportDir = path.join(options.out, 'reports')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(reportDir, { recursive: true })
  const now = new Date()
  for (const collection of SEED_COLLECTIONS) {
    writeJson(path.join(dataDir, `${collection}.json`), { docs: output[collection] })
  }
  // ANON-9: 匿名化した日を記録する
  writeJson(path.join(dataDir, 'meta.json'), {
    anonymizedAt: toJstDate(now),
    scriptVersion: SCRIPT_VERSION,
    source: options.source !== undefined ? 'directory' : 'firestore',
    counts: Object.fromEntries(SEED_COLLECTIONS.map((c) => [c, output[c].length])),
  })

  // ANON-10, ANON-11: 形のレポート（値は含まない）。前回と比べて型の種類が増えたフィールドを警告する
  const report = buildShapeReport(input, now.toISOString())
  const latestPath = path.join(reportDir, 'shape-latest.json')
  const previous = existsSync(latestPath) ? (JSON.parse(readFileSync(latestPath, 'utf8')) as ShapeReport) : null
  writeJson(path.join(reportDir, `shape-${toTimestampName(now)}.json`), report)
  writeJson(latestPath, report)
  const warnings = diffShapeReports(previous, report)

  console.log(`匿名化データを書き出しました: ${dataDir}`)
  for (const c of SEED_COLLECTIONS) console.log(`  ${c}: ${output[c].length} 件`)
  console.log(`形のレポート: ${latestPath}`)
  if (previous === null) console.log('  前回のレポートがないため、形の変化は比べていません。')
  for (const w of warnings) console.warn(`  警告（本番データの形が変わった可能性）: ${w}`)
}

function parseArgs(args: string[]): Options {
  const value = (name: string) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const options: Options = { project: value('--project'), source: value('--source'), out: value('--out') ?? '.localdev' }
  if (options.source === undefined && options.project === undefined) {
    fail(['--project <本番の project ID> を指定してください（npm run anonymize -- --project <ID> --sa <SA>）。'])
  }
  if (options.project?.startsWith(DEMO_PROJECT_PREFIX)) fail(['--project に demo- の project ID は指定できません。'])
  return options
}

// ANON-6: 本番に対しては読み取りだけ。全件を読む。整数と小数を区別するため useBigInt を使う
async function readFromFirestore(projectId: string | undefined): Promise<CollectionDocuments> {
  if (projectId === undefined) fail(['--project が必要です。'])
  const app = initializeApp({ credential: applicationDefault(), projectId }, 'anonymize')
  const db = getFirestore(app)
  db.settings({ useBigInt: true })
  const result = {} as CollectionDocuments
  for (const collection of SEED_COLLECTIONS) {
    const snapshot = await db.collection(collection).get()
    const raw = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }))
    result[collection] = toJsonDocuments(serializeDocuments(raw).docs, collection)
  }
  return result
}

function readFromDirectory(dir: string): CollectionDocuments {
  const result = {} as CollectionDocuments
  for (const collection of SEED_COLLECTIONS) {
    const file = JSON.parse(readFileSync(path.join(dir, `${collection}.json`), 'utf8')) as { docs?: unknown }
    if (!Array.isArray(file.docs)) fail([`${collection}.json の形が違います（docs がない）。`])
    result[collection] = toJsonDocuments(file.docs as { id: string; data: JsonValue }[], collection)
  }
  return result
}

function toJsonDocuments(docs: { id: string; data: JsonValue }[], collection: string): JsonDocument[] {
  return docs.map((doc) => {
    // エラーにはドキュメント ID とコレクション名だけを出す（値は出さない）
    if (typeof doc.id !== 'string' || !isJsonObject(doc.data)) fail([`${collection}/${String(doc.id)} の形が違います。`])
    return { id: doc.id, data: doc.data }
  })
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function toJstDate(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function toTimestampName(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

function fail(lines: string[]): never {
  console.error(lines.join('\n'))
  process.exit(1)
}

main().catch((e: unknown) => {
  // 例外メッセージに値が含まれうるので、種類だけを出す
  const code = typeof e === 'object' && e !== null && 'code' in e ? ` (code: ${String((e as { code: unknown }).code)})` : ''
  console.error(`匿名化に失敗しました: ${e instanceof Error ? e.name : typeof e}${code}`)
  process.exit(1)
})
