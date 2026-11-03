import { ALLOWLIST, childPath, elementPath, treatmentOf } from './allowlist'
import type { AnonymizedCollection } from './allowlist'
import { createIdRemapper } from './idRemap'
import type { IdRemapper } from './idRemap'
import { maskValue } from './mask'
import type { MaskContext } from './mask'
import type { Rng } from './rng'
import type { JsonValue } from './serialize'
import { kindOf, mapEntries, toMap } from './tagged'
import type { JsonObject } from './tagged'
import { shuffled } from './shuffle'

// 保存形式（タグ付き JSON）のドキュメント。変換は Firestore の型に依存しない純粋関数で行う
export type JsonDocument = { id: string; data: JsonObject }
export type CollectionDocuments = Record<AnonymizedCollection, JsonDocument[]>

const COLLECTIONS: AnonymizedCollection[] = ['guestInfoV2', 'dailyInfo']

// 全コレクションをまとめて変換する。ID の対応表はコレクションをまたいで共有する。ドキュメントの順序は保つ
export function anonymizeCollections(input: CollectionDocuments, rng: Rng): CollectionDocuments {
  const remapper = createIdRemapper(rng)
  const ctx: MaskContext = { rng, remapId: (id) => remapper.remap(id) }
  const result = {} as CollectionDocuments
  for (const collection of COLLECTIONS) {
    const docs = shuffleFields(collection, input[collection], rng)
    result[collection] = docs.map((doc) => ({
      id: ALLOWLIST[collection].docId === 'id' ? remapper.remap(doc.id) : doc.id,
      data: transformEntries(collection, doc.data, '', ctx, remapper),
    }))
  }
  return result
}

// シャッフル: そのフィールドを持つ全レコードの間で値を入れ替える。null と '' も対象。欠損は欠損のまま（Q-3）
function shuffleFields(collection: AnonymizedCollection, docs: JsonDocument[], rng: Rng): JsonDocument[] {
  let current = docs
  for (const field of ALLOWLIST[collection].shuffle) {
    if (field.includes('.') || field.includes('[]')) {
      throw new Error(`シャッフルはトップレベルのフィールドだけに対応しています: ${field}`)
    }
    const holders = current.filter((doc) => field in doc.data)
    const values = shuffled(holders.map((doc) => doc.data[field]), rng)
    let next = 0
    current = current.map((doc) => (field in doc.data ? { ...doc, data: { ...doc.data, [field]: values[next++] } } : doc))
  }
  return current
}

function transformEntries(
  collection: AnonymizedCollection, entries: JsonObject, parent: string, ctx: MaskContext, remapper: IdRemapper,
): JsonObject {
  const result: JsonObject = {}
  for (const [key, value] of Object.entries(entries)) {
    result[key] = transformNode(collection, value, childPath(parent, key), ctx, remapper)
  }
  return result
}

function transformNode(
  collection: AnonymizedCollection, value: JsonValue, path: string, ctx: MaskContext, remapper: IdRemapper,
): JsonValue {
  switch (treatmentOf(collection, path)) {
    case 'keep':
    case 'shuffle': // 値の入れ替えは shuffleFields で済んでいる
      return value
    case 'id':
      // 文字列だけを振り直す。null はそのまま、文字列以外（破損値）はマスク（Q-4）
      if (typeof value === 'string') return remapper.remap(value)
      if (value === null) return value
      return maskValue(value, ctx)
    case 'mask': {
      // 入れ物は中まで降りる（中に許可リストのパスがあるため。例: mail_memo[].month）
      const kind = kindOf(value)
      if (kind === 'array') {
        return (value as JsonValue[]).map((v) => transformNode(collection, v, elementPath(path), ctx, remapper))
      }
      if (kind === 'map') {
        return toMap(transformEntries(collection, mapEntries(value as JsonObject), path, ctx, remapper))
      }
      return maskValue(value, ctx)
    }
  }
}

// 自己検査: 日付と部屋のパスの値が変換前後で一致する件数を数える（値は出力しない）
const PRESERVED_FIELDS: Record<AnonymizedCollection, readonly string[]> = {
  guestInfoV2: ['check_in_date', 'check_out_date', 'room'],
  dailyInfo: ['date', 'updated_at', 'migrated_at'],
}

export type PreservationCheck = { collection: AnonymizedCollection; checked: number; mismatched: number }

export function checkPreserved(before: CollectionDocuments, after: CollectionDocuments): PreservationCheck[] {
  return COLLECTIONS.map((collection) => {
    let checked = 0
    let mismatched = 0
    const compare = (a: unknown, b: unknown) => {
      checked++
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatched++
    }
    before[collection].forEach((doc, i) => {
      const out = after[collection][i]
      if (ALLOWLIST[collection].docId === 'keep') compare(doc.id, out?.id)
      for (const field of PRESERVED_FIELDS[collection]) {
        if (field in doc.data || (out !== undefined && field in out.data)) compare(doc.data[field], out?.data[field])
      }
    })
    return { collection, checked, mismatched }
  })
}
