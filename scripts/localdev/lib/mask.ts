import { pick } from './rng'
import type { Rng } from './rng'
import type { JsonValue } from './serialize'
import { kindOf, mapEntries, toMap } from './tagged'
import type { JsonObject } from './tagged'

// マスク（docs/LocalDevelopment.md §4.3 マスク）
// - 文字列: 1文字ずつ、同じ種類・同じ幅の乱数の文字に置き換える。文字数は保つ
// - 数値: 同じ桁数の乱数。整数か小数か、符号を保つ。0 は 0 のまま。NaN / Infinity はそのまま
// - '' / null / 真偽値: そのまま。配列・マップ: 要素ごとに再帰
// - Timestamp: そのまま（日付はずらさない。Q-1）。GeoPoint: (0, 0)。Bytes: 同じ長さの乱数。Reference: パス中の ID を振り直す

// 小学1年の教育漢字（80字。すべて常用漢字）
export const KANJI_POOL = Array.from(
  '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六',
)

const codePoints = (from: number, to: number): string[] => {
  const result: string[] = []
  for (let c = from; c <= to; c++) result.push(String.fromCodePoint(c))
  return result
}

const HALF_DIGITS = codePoints(0x30, 0x39)
const FULL_DIGITS = codePoints(0xff10, 0xff19)
const HALF_UPPER = codePoints(0x41, 0x5a)
const HALF_LOWER = codePoints(0x61, 0x7a)
const FULL_UPPER = codePoints(0xff21, 0xff3a)
const FULL_LOWER = codePoints(0xff41, 0xff5a)
const HIRAGANA = codePoints(0x3042, 0x3093) // あ〜ん
const KATAKANA = codePoints(0x30a2, 0x30f3) // ア〜ン
const HALF_KATAKANA = codePoints(0xff71, 0xff9d) // ｱ〜ﾝ

type CharClass = { test: (cp: number) => boolean; pool: readonly string[] }

const inRange = (from: number, to: number) => (cp: number) => cp >= from && cp <= to

// 上から順に判定する。どれにも当てはまらない文字はそのまま残す（空白、改行、記号、句読点、絵文字、結合文字）
const CHAR_CLASSES: CharClass[] = [
  { test: inRange(0x30, 0x39), pool: HALF_DIGITS },
  { test: inRange(0xff10, 0xff19), pool: FULL_DIGITS },
  { test: inRange(0x41, 0x5a), pool: HALF_UPPER },
  { test: inRange(0x61, 0x7a), pool: HALF_LOWER },
  { test: inRange(0xff21, 0xff3a), pool: FULL_UPPER },
  { test: inRange(0xff41, 0xff5a), pool: FULL_LOWER },
  { test: inRange(0x3041, 0x3096), pool: HIRAGANA }, // 小書き文字を含むひらがな
  { test: inRange(0x30a1, 0x30fa), pool: KATAKANA }, // ・ ー（30FB, 30FC）は範囲外なので残る
  { test: inRange(0xff66, 0xff9d), pool: HALF_KATAKANA }, // ｰ ﾞ ﾟ（FF70, FF9E, FF9F）は KEPT_LETTERS で先に残す
  { test: isKanji, pool: KANJI_POOL }, // 々 〆（3005, 3006）は範囲外なので残る
]

function isKanji(cp: number): boolean {
  return (cp >= 0x4e00 && cp <= 0x9fff) // CJK 統合漢字
    || (cp >= 0x3400 && cp <= 0x4dbf) // 拡張 A
    || (cp >= 0xf900 && cp <= 0xfaff) // 互換漢字
    || (cp >= 0x20000 && cp <= 0x3134f) // 拡張 B 以降
}

// 「上記以外の文字」の全角判定（Unicode East Asian Width の F / W の主な範囲。Q-6）
function isWide(cp: number): boolean {
  return (cp >= 0x1100 && cp <= 0x115f)
    || (cp >= 0x2e80 && cp <= 0xa4cf)
    || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe30 && cp <= 0xfe4f)
    || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x3fffd)
}

const LETTER_OR_DIGIT = /[\p{L}\p{Nd}\p{Nl}]/u

// Unicode では文字（Letter）に分類されるが、記号として残すもの（Q-5）
// 々 〆 〱〜〵 ゝ ゞ ー ヽ ヾ ｰ ﾞ ﾟ
const KEPT_LETTERS = new Set([0x3005, 0x3006, 0x3031, 0x3032, 0x3033, 0x3034, 0x3035, 0x309d, 0x309e, 0x30fc, 0x30fd, 0x30fe, 0xff70, 0xff9e, 0xff9f])
// 絵文字のキーキャップ（1️⃣ など）の数字は記号の一部として残す
const KEYCAP_FOLLOWERS = new Set([0xfe0f, 0x20e3])

export function maskString(value: string, rng: Rng): string {
  const chars = Array.from(value) // コードポイント単位（サロゲートペアを壊さない）
  return chars.map((ch, i) => {
    const cp = ch.codePointAt(0) ?? 0
    const next = chars[i + 1]?.codePointAt(0)
    if (next !== undefined && KEYCAP_FOLLOWERS.has(next)) return ch
    if (KEPT_LETTERS.has(cp)) return ch
    const charClass = CHAR_CLASSES.find((c) => c.test(cp))
    if (charClass) return pick(rng, charClass.pool)
    // アクセント付きラテン文字、ハングルなど: 半角なら半角英字、全角なら漢字
    if (LETTER_OR_DIGIT.test(ch)) return isWide(cp) ? pick(rng, KANJI_POOL) : pick(rng, HALF_LOWER)
    return ch
  }).join('')
}

// 10進数字の並びを同じ桁数の乱数にする。先頭は 0 以外（1桁の 0 はそのまま）
function maskDigits(digits: string, rng: Rng, options: { lastNonZero?: boolean } = {}): string {
  if (digits === '0') return '0'
  return Array.from(digits, (_, i) => {
    const mustBeNonZero = i === 0 || (options.lastNonZero === true && i === digits.length - 1)
    return String(mustBeNonZero ? 1 + rng.int(9) : rng.int(10))
  }).join('')
}

// integerValue（BigInt を10進文字列で保存）
export function maskIntString(value: string, rng: Rng): string {
  const negative = value.startsWith('-')
  const masked = maskDigits(negative ? value.slice(1) : value, rng)
  return negative && masked !== '0' ? `-${masked}` : masked
}

// doubleValue（有限値）。整数部と小数部の桁数をそれぞれ保つ（Q-2）
export function maskDouble(value: number, rng: Rng): number {
  if (value === 0) return value
  const negative = value < 0
  const [mantissa, exponent] = Math.abs(value).toString().split('e')
  const [intPart, fracPart] = mantissa.split('.')
  const maskedInt = intPart === '0' ? '0' : maskDigits(intPart, rng)
  // 末尾の 0 は文字列化で消えて桁数が変わるので、小数部の最後は 0 以外にする
  const maskedFrac = fracPart === undefined ? '' : `.${maskDigits(fracPart, rng, { lastNonZero: true })}`
  const masked = Number(`${maskedInt}${maskedFrac}${exponent === undefined ? '' : `e${exponent}`}`)
  return negative ? -masked : masked
}

function maskBytes(b64: string, rng: Rng): string {
  const length = Buffer.from(b64, 'base64').length
  return Buffer.from(Array.from({ length }, () => rng.int(256))).toString('base64')
}

export type MaskContext = {
  rng: Rng
  // Reference のパス中の ID を振り直すために使う
  remapId: (id: string) => string
}

export function maskValue(value: JsonValue, ctx: MaskContext): JsonValue {
  switch (kindOf(value)) {
    case 'null':
    case 'boolean':
    case 'special': // NaN, Infinity, -Infinity, -0
    case 'timestamp':
      return value
    case 'string':
      return value === '' ? value : maskString(value as string, ctx.rng)
    case 'double':
      return maskDouble(value as number, ctx.rng)
    case 'int':
      return { $t: 'int', v: maskIntString(String((value as JsonObject).v), ctx.rng) }
    case 'geopoint':
      return { $t: 'geopoint', lat: 0, lng: 0 }
    case 'bytes':
      return { $t: 'bytes', b64: maskBytes(String((value as JsonObject).b64), ctx.rng) }
    case 'ref':
      return { $t: 'ref', path: remapRefPath(String((value as JsonObject).path), ctx.remapId) }
    case 'array':
      return (value as JsonValue[]).map((v) => maskValue(v, ctx))
    case 'map': {
      const entries = mapEntries(value as JsonObject)
      const masked: JsonObject = {}
      for (const [k, v] of Object.entries(entries)) masked[k] = maskValue(v, ctx)
      return toMap(masked)
    }
  }
}

// collection/docId/collection/docId... の docId（偶数番目でない位置）だけを振り直す
function remapRefPath(path: string, remapId: (id: string) => string): string {
  return path.split('/').map((segment, i) => (i % 2 === 1 ? remapId(segment) : segment)).join('/')
}

