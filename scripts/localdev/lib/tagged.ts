import type { JsonValue } from './serialize'

// 保存形式（serialize.ts のタグ付き JSON）の値を種類ごとに見分ける
export type TaggedKind =
  | 'null' | 'boolean' | 'string' | 'double' | 'int' | 'special'
  | 'timestamp' | 'geopoint' | 'ref' | 'bytes' | 'array' | 'map'

const TAGS = new Set(['int', 'number', 'timestamp', 'geopoint', 'ref', 'bytes', 'map'])

export type JsonObject = { [key: string]: JsonValue }

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function kindOf(value: JsonValue): TaggedKind {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'double'
  if (Array.isArray(value)) return 'array'
  const tag = value.$t
  if (typeof tag === 'string' && TAGS.has(tag)) {
    if (tag === 'number') return 'special'
    if (tag === 'map') return 'map'
    return tag as TaggedKind
  }
  return 'map'
}

// マップの中身（"$t" をエスケープしたマップは中身を取り出す）
export function mapEntries(value: JsonObject): JsonObject {
  return value.$t === 'map' && isJsonObject(value.v ?? null) ? (value.v as JsonObject) : value
}

// 中身からマップを作り直す（"$t" キーを持つならエスケープし直す）
export function toMap(entries: JsonObject): JsonValue {
  return '$t' in entries ? { $t: 'map', v: entries } : entries
}
