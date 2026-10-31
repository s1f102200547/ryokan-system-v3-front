// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { Timestamp, GeoPoint } from 'firebase-admin/firestore'
import { serializeValue, deserializeValue, parseDocumentFile } from '../../../scripts/localdev/lib/serialize'

// Reference は Firestore のインスタンスが必要なので、テストでは path を持つだけの代役にする
const toRef = (path: string) => ({ refPath: path })

function roundTrip(value: unknown): unknown {
  // ファイルに書いて読み戻すのと同じ経路を通す
  const json = JSON.parse(JSON.stringify(serializeValue(value)))
  return deserializeValue(json, toRef)
}

describe('serialize / deserialize の往復', () => {
  it.each([
    ['文字列', 'あいう abc'],
    ['空文字', ''],
    ['null', null],
    ['真偽値', true],
    ['有限の小数', 1.5],
    ['負の小数', -12.25],
  ])('%s はそのまま', (_, value) => {
    expect(roundTrip(value)).toEqual(value)
  })

  it('BigInt（integerValue）は 2^53 を超えても値と型を保つ', () => {
    const value = BigInt('9007199254740993')
    expect(serializeValue(value)).toEqual({ $t: 'int', v: '9007199254740993' })
    expect(roundTrip(value)).toBe(value)
  })

  it('負の BigInt と 0 の BigInt を保つ', () => {
    expect(roundTrip(BigInt('-42'))).toBe(BigInt('-42'))
    expect(roundTrip(BigInt('0'))).toBe(BigInt('0'))
  })

  it.each([NaN, Infinity, -Infinity])('%s を保つ', (value) => {
    expect(Object.is(roundTrip(value), value)).toBe(true)
  })

  it('-0 を保つ', () => {
    expect(Object.is(roundTrip(-0), -0)).toBe(true)
  })

  it('Timestamp を秒とナノ秒まで保つ', () => {
    const value = new Timestamp(1767225600, 123456789)
    const restored = roundTrip(value)
    expect(restored).toBeInstanceOf(Timestamp)
    expect((restored as Timestamp).isEqual(value)).toBe(true)
  })

  it('GeoPoint を保つ', () => {
    const restored = roundTrip(new GeoPoint(35.68, 139.76))
    expect(restored).toBeInstanceOf(GeoPoint)
    expect((restored as GeoPoint).isEqual(new GeoPoint(35.68, 139.76))).toBe(true)
  })

  it('Reference は path で保存し、toRef で戻す', () => {
    const ref = { path: 'guestInfoV2/abc', firestore: {}, id: 'abc' }
    expect(serializeValue(ref, { isReference: (v): v is { path: string } => v === ref })).toEqual({ $t: 'ref', path: 'guestInfoV2/abc' })
    expect(deserializeValue({ $t: 'ref', path: 'guestInfoV2/abc' }, toRef)).toEqual({ refPath: 'guestInfoV2/abc' })
  })

  it('Bytes を保つ', () => {
    const restored = roundTrip(Buffer.from([0, 1, 254, 255]))
    expect(Buffer.from(restored as Uint8Array)).toEqual(Buffer.from([0, 1, 254, 255]))
  })

  it('配列とマップを再帰的に保つ', () => {
    const value = {
      mail_memo: [{ month: '1', day: '2', n: BigInt('3') }],
      nested: { at: new Timestamp(1, 0), nan: NaN },
    }
    const restored = roundTrip(value) as typeof value
    expect(restored.mail_memo).toEqual([{ month: '1', day: '2', n: BigInt('3') }])
    expect((restored.nested.at as Timestamp).isEqual(new Timestamp(1, 0))).toBe(true)
    expect(Number.isNaN(restored.nested.nan)).toBe(true)
  })

  it('"$t" キーを持つマップはエスケープし、タグと取り違えない', () => {
    const value = { $t: 'int', v: '1' }
    expect(serializeValue(value)).toEqual({ $t: 'map', v: { $t: 'int', v: '1' } })
    expect(roundTrip(value)).toEqual({ $t: 'int', v: '1' })
  })

  it('キー欠損と null を区別する', () => {
    expect(roundTrip({ a: null })).toEqual({ a: null })
    expect(Object.keys(roundTrip({}) as object)).toEqual([])
  })

  it('未知の型は例外にする（黙って欠損させない）', () => {
    expect(() => serializeValue(() => 1)).toThrow()
    expect(() => serializeValue(undefined)).toThrow()
  })

  it('未知のタグは例外にする', () => {
    expect(() => deserializeValue({ $t: 'unknown' }, toRef)).toThrow()
  })
})

describe('parseDocumentFile', () => {
  it('docs 配列を ID とデータに戻す', () => {
    const file = { docs: [{ id: 'd1', data: { n: { $t: 'int', v: '2' } } }] }
    expect(parseDocumentFile(file, toRef)).toEqual([{ id: 'd1', data: { n: BigInt('2') } }])
  })

  it.each([
    ['docs がない', {}],
    ['id が文字列でない', { docs: [{ id: 1, data: {} }] }],
    ['id が空', { docs: [{ id: '', data: {} }] }],
    ['data がマップでない', { docs: [{ id: 'd1', data: [] }] }],
  ])('形が違うと例外（%s）', (_, file) => {
    expect(() => parseDocumentFile(file, toRef)).toThrow()
  })
})

describe('fixture（tests/fixtures/localdev）', () => {
  it.each(['guestInfoV2', 'dailyInfo'])('%s.json が保存形式として読める', async (collection) => {
    const { readFileSync } = await import('node:fs')
    const file = JSON.parse(readFileSync(`tests/fixtures/localdev/${collection}.json`, 'utf8'))
    expect(parseDocumentFile(file, toRef).length).toBeGreaterThan(0)
  })
})
