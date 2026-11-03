import type { AnonymizedCollection } from './allowlist'
import { childPath, elementPath } from './allowlist'
import { isValidDashDate, isValidIsoDateTime, isValidMonthDay, isValidSlashDate } from './dateValidity'
import type { JsonValue } from './serialize'
import { kindOf, mapEntries } from './tagged'
import type { JsonObject } from './tagged'
import type { CollectionDocuments } from './transform'

// 形のレポート: コレクション・フィールドごとの型の件数だけを数える。値は含めない
export type ShapeKind =
  | 'string' | 'emptyString' | 'integer' | 'double' | 'NaN' | 'Infinity' | 'boolean' | 'null'
  | 'missing' | 'array' | 'map' | 'timestamp' | 'geopoint' | 'ref' | 'bytes' | 'corruptedDate'

export type FieldShape = Partial<Record<ShapeKind, number>>

export type ShapeReport = {
  generatedAt: string
  collections: Record<string, { docCount: number; fields: Record<string, FieldShape> }>
}

// ドキュメント ID と、mail_memo の月日の組は実在のフィールドではないので、仮のパスで数える
export const DOC_ID_PATH = '(id)'
export const MAIL_MEMO_MONTH_DAY_PATH = 'mail_memo[].(month+day)'

const DATE_RULES: Record<string, Record<string, (v: string) => boolean>> = {
  guestInfoV2: { check_in_date: isValidSlashDate, check_out_date: isValidSlashDate },
  dailyInfo: { [DOC_ID_PATH]: isValidDashDate, date: isValidDashDate, updated_at: isValidIsoDateTime, migrated_at: isValidIsoDateTime },
}

export function buildShapeReport(collections: CollectionDocuments, generatedAt: string): ShapeReport {
  const report: ShapeReport = { generatedAt, collections: {} }
  for (const [collection, docs] of Object.entries(collections) as [AnonymizedCollection, CollectionDocuments[AnonymizedCollection]][]) {
    const fields: Record<string, FieldShape> = {}
    const add = (path: string, kind: ShapeKind) => {
      const shape = (fields[path] ??= {})
      shape[kind] = (shape[kind] ?? 0) + 1
    }
    // マップとして現れた回数（キー欠損の母数）と、その中に現れたキー
    const mapCounts = new Map<string, number>()
    const presentCounts = new Map<string, number>()

    const visitMap = (entries: JsonObject, path: string) => {
      mapCounts.set(path, (mapCounts.get(path) ?? 0) + 1)
      for (const [key, value] of Object.entries(entries)) {
        const child = childPath(path, key)
        presentCounts.set(child, (presentCounts.get(child) ?? 0) + 1)
        visit(value, child)
      }
    }
    const visit = (value: JsonValue, path: string) => {
      const kind = kindOf(value)
      add(path, shapeKindOf(value, kind))
      if (typeof value === 'string' && DATE_RULES[collection]?.[path] && !DATE_RULES[collection][path](value)) {
        add(path, 'corruptedDate')
      }
      if (kind === 'array') (value as JsonValue[]).forEach((v) => visit(v, elementPath(path)))
      if (kind === 'map') {
        const entries = mapEntries(value as JsonObject)
        visitMap(entries, path)
        if (collection === 'guestInfoV2' && path === 'mail_memo[]') countMailMemoDate(entries, add)
      }
    }

    for (const doc of docs) {
      add(DOC_ID_PATH, 'string')
      if (DATE_RULES[collection]?.[DOC_ID_PATH] && !DATE_RULES[collection][DOC_ID_PATH](doc.id)) add(DOC_ID_PATH, 'corruptedDate')
      visitMap(doc.data, '')
    }
    // 母数のマップに現れなかった回数 = 欠損
    for (const [path, present] of presentCounts) {
      const parent = parentMapPath(path)
      const missing = (mapCounts.get(parent) ?? 0) - present
      if (missing > 0) (fields[path] ??= {}).missing = missing
    }
    // ファイル同士を見比べやすいよう、フィールドも種類も並び順を固定する
    const sorted = Object.fromEntries(Object.entries(sortKeys(fields)).map(([path, shape]) => [path, sortKeys(shape)]))
    report.collections[collection] = { docCount: docs.length, fields: sorted }
  }
  return report
}

function countMailMemoDate(entries: JsonObject, add: (path: string, kind: ShapeKind) => void): void {
  const { month, day } = entries
  if (typeof month === 'string' && typeof day === 'string' && !isValidMonthDay(month, day)) {
    add(MAIL_MEMO_MONTH_DAY_PATH, 'corruptedDate')
  }
}

function shapeKindOf(value: JsonValue, kind: ReturnType<typeof kindOf>): ShapeKind {
  switch (kind) {
    case 'string': return value === '' ? 'emptyString' : 'string'
    case 'int': return 'integer'
    case 'special': {
      const v = (value as JsonObject).v
      return v === 'NaN' ? 'NaN' : v === '-0' ? 'double' : 'Infinity'
    }
    default: return kind
  }
}

function parentMapPath(path: string): string {
  const i = path.lastIndexOf('.')
  return i === -1 ? '' : path.slice(0, i)
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
}

// 大きさのレポート（予約 API の入力の上限を決めるため）: フィールドごとの文字列の最大長と配列の最大件数だけを数える。値は含めない
// 文字数は UTF-16 の length で数える（画面の maxLength と同じ。Zod 4 のコードポイントの数以上になるので、上限を決めるには安全側）。
// ID の振り直しやシャッフルで文字数が変わるので、匿名化しても変わらない形のレポートとは分ける
export type FieldSize = { maxLength?: number; maxItems?: number }

export type SizeReport = {
  generatedAt: string
  collections: Record<string, Record<string, FieldSize>>
}

export function buildSizeReport(collections: CollectionDocuments, generatedAt: string): SizeReport {
  const report: SizeReport = { generatedAt, collections: {} }
  for (const [collection, docs] of Object.entries(collections)) {
    const sizes: Record<string, FieldSize> = {}
    const record = (path: string, key: keyof FieldSize, n: number) => {
      const size = (sizes[path] ??= {})
      size[key] = Math.max(size[key] ?? 0, n)
    }
    const visit = (value: JsonValue, path: string) => {
      const kind = kindOf(value)
      if (typeof value === 'string') record(path, 'maxLength', value.length)
      if (kind === 'array') {
        const items = value as JsonValue[]
        record(path, 'maxItems', items.length)
        items.forEach((v) => visit(v, elementPath(path)))
      }
      if (kind === 'map') {
        for (const [key, v] of Object.entries(mapEntries(value as JsonObject))) visit(v, childPath(path, key))
      }
    }
    for (const doc of docs) {
      for (const [key, v] of Object.entries(doc.data)) visit(v, childPath('', key))
    }
    report.collections[collection] = sortKeys(sizes)
  }
  return report
}

// 前回より型の種類が増えたフィールド、新しく現れたフィールドを警告する。件数の増減だけでは警告しない
export function diffShapeReports(previous: ShapeReport | null, current: ShapeReport): string[] {
  if (previous === null) return []
  const warnings: string[] = []
  for (const [collection, { fields }] of Object.entries(current.collections)) {
    const before = previous.collections[collection]?.fields ?? {}
    for (const [path, shape] of Object.entries(fields)) {
      if (!(path in before)) {
        warnings.push(`${collection}.${path}: 新しいフィールド（${kindsOf(shape).join(', ')}）`)
        continue
      }
      const added = kindsOf(shape).filter((k) => !kindsOf(before[path]).includes(k))
      if (added.length > 0) warnings.push(`${collection}.${path}: 型の種類が増えた（${added.join(', ')}）`)
    }
  }
  return warnings
}

function kindsOf(shape: FieldShape): ShapeKind[] {
  return (Object.entries(shape) as [ShapeKind, number][]).filter(([, n]) => n > 0).map(([k]) => k)
}
