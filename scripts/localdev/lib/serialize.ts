import { DocumentReference, GeoPoint, Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'

// 匿名化データの保存形式（docs/LocalDevelopmentImplementation.md §1.4）
// JSON で表せない Firestore の値はタグ付きオブジェクトにする。素の JSON の number は doubleValue（有限値）だけを表す
//   { $t: 'int', v: '9007199254740993' }       integerValue（読み取りは useBigInt: true で BigInt）
//   { $t: 'number', v: 'NaN' }                 NaN, Infinity, -Infinity, -0
//   { $t: 'timestamp', s: 1767225600, n: 0 }
//   { $t: 'geopoint', lat: 0, lng: 0 }
//   { $t: 'ref', path: 'guestInfoV2/xxx' }
//   { $t: 'bytes', b64: '...' }
//   { $t: 'map', v: { ... } }                   元のマップ自身が "$t" キーを持つ場合のエスケープ

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const TAG = '$t'

type SerializeOptions = {
  isReference?: (value: unknown) => value is { path: string }
}

const isAdminReference = (value: unknown): value is { path: string } => value instanceof DocumentReference

export function serializeValue(value: unknown, options: SerializeOptions = {}): JsonValue {
  const isReference = options.isReference ?? isAdminReference

  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'bigint') return { [TAG]: 'int', v: value.toString() }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { [TAG]: 'number', v: 'NaN' }
    if (value === Infinity) return { [TAG]: 'number', v: 'Infinity' }
    if (value === -Infinity) return { [TAG]: 'number', v: '-Infinity' }
    if (Object.is(value, -0)) return { [TAG]: 'number', v: '-0' }
    return value
  }
  if (value instanceof Timestamp) return { [TAG]: 'timestamp', s: value.seconds, n: value.nanoseconds }
  if (value instanceof GeoPoint) return { [TAG]: 'geopoint', lat: value.latitude, lng: value.longitude }
  if (isReference(value)) return { [TAG]: 'ref', path: value.path }
  // Firestore の bytes は Buffer（Uint8Array）で返る。realm をまたいでも判定できる isView を使う
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return { [TAG]: 'bytes', b64: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') }
  }
  if (Array.isArray(value)) return value.map((v) => serializeValue(v, options))
  if (isPlainObject(value)) {
    const entries: Record<string, JsonValue> = {}
    for (const [k, v] of Object.entries(value)) entries[k] = serializeValue(v, options)
    return TAG in value ? { [TAG]: 'map', v: entries } : entries
  }
  // undefined や関数など Firestore にない値。黙って落とすと「形」が変わるので止める
  throw new Error(`serializeValue: 未対応の値（${typeof value}）`)
}

export function deserializeValue(json: unknown, toRef: (path: string) => unknown): unknown {
  if (json === null || typeof json === 'boolean' || typeof json === 'string' || typeof json === 'number') return json
  if (Array.isArray(json)) return json.map((v) => deserializeValue(v, toRef))
  if (!isPlainObject(json)) throw new Error('deserializeValue: 未対応の値')

  if (!(TAG in json)) return deserializeEntries(json, toRef)

  const tagged = TaggedSchema.parse(json)
  switch (tagged.$t) {
    case 'int': return BigInt(tagged.v)
    case 'number': return SPECIAL_NUMBERS[tagged.v]
    case 'timestamp': return new Timestamp(tagged.s, tagged.n)
    case 'geopoint': return new GeoPoint(tagged.lat, tagged.lng)
    case 'ref': return toRef(tagged.path)
    case 'bytes': return Buffer.from(tagged.b64, 'base64')
    case 'map': return deserializeEntries(tagged.v, toRef)
  }
}

const SPECIAL_NUMBERS = { 'NaN': NaN, 'Infinity': Infinity, '-Infinity': -Infinity, '-0': -0 } as const

// strict: 余計なキーを持つタグ付きオブジェクトは壊れたファイルとして扱う
const TaggedSchema = z.discriminatedUnion('$t', [
  z.strictObject({ $t: z.literal('int'), v: z.string().regex(/^-?\d+$/) }),
  z.strictObject({ $t: z.literal('number'), v: z.enum(['NaN', 'Infinity', '-Infinity', '-0']) }),
  z.strictObject({ $t: z.literal('timestamp'), s: z.number().int(), n: z.number().int() }),
  z.strictObject({ $t: z.literal('geopoint'), lat: z.number(), lng: z.number() }),
  z.strictObject({ $t: z.literal('ref'), path: z.string().min(1) }),
  z.strictObject({ $t: z.literal('bytes'), b64: z.string() }),
  z.strictObject({ $t: z.literal('map'), v: z.record(z.string(), z.unknown()) }),
])

function deserializeEntries(entries: Record<string, unknown>, toRef: (path: string) => unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(entries)) result[k] = deserializeValue(v, toRef)
  return result
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// --- ファイル単位 ---

export type StoredDocument = { id: string; data: Record<string, unknown> }

const DocumentFileSchema = z.object({
  docs: z.array(z.object({
    id: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })),
})

export function parseDocumentFile(file: unknown, toRef: (path: string) => unknown): StoredDocument[] {
  const parsed = DocumentFileSchema.parse(file)
  return parsed.docs.map((doc) => ({ id: doc.id, data: deserializeEntries(doc.data, toRef) }))
}

export function serializeDocuments(docs: StoredDocument[], options: SerializeOptions = {}): { docs: { id: string; data: JsonValue }[] } {
  return { docs: docs.map((doc) => ({ id: doc.id, data: serializeValue(doc.data, options) })) }
}
