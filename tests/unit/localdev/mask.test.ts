// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { KANJI_POOL, maskDouble, maskIntString, maskString, maskValue } from '../../../scripts/localdev/lib/mask'
import { seededRng } from '../../../scripts/localdev/lib/rng'

// 元の文字の種類ごとに、置き換え後に許される文字（実装とは独立に書く）
const CLASSES: [string, RegExp, (out: string) => boolean][] = [
  ['半角数字', /^[0-9]$/, (o) => /^[0-9]$/.test(o)],
  ['全角数字', /^[０-９]$/, (o) => /^[０-９]$/.test(o)],
  ['半角大文字', /^[A-Z]$/, (o) => /^[A-Z]$/.test(o)],
  ['半角小文字', /^[a-z]$/, (o) => /^[a-z]$/.test(o)],
  ['全角大文字', /^[Ａ-Ｚ]$/, (o) => /^[Ａ-Ｚ]$/.test(o)],
  ['全角小文字', /^[ａ-ｚ]$/, (o) => /^[ａ-ｚ]$/.test(o)],
  ['ひらがな', /^[ぁ-ゖ]$/, (o) => /^[ぁ-ゖ]$/.test(o)],
  ['全角カタカナ', /^[ァ-ヺ]$/, (o) => /^[ァ-ヺ]$/.test(o)],
  ['半角カタカナ', /^[ｦ-ﾝ]$/, (o) => /^[ｦ-ﾝ]$/.test(o)],
  ['漢字', /^\p{Script=Han}$/u, (o) => KANJI_POOL.includes(o)],
]

const KEPT = ['ｰ', 'ゝ', 'ヽ',  '\n', '\t', '　', '-', '@', '.', '(', ')', '、', '。', '「', '」', '！', '？', '・', 'ー', '々', '〆', 'ﾞ', '①', '㉑', '😀', '‍', '️', '́']

describe('maskString（AC-20）', () => {
  const samples = [
    '山田 太郎', 'ヤマダ タロウ', 'ﾔﾏﾀﾞ ﾀﾛｳ', 'Taro YAMADA', 'ＴＡＲＯ　ｙａｍａｄａ',
    '090-1234-5678', '０９０−１２３４−５６７８', 'taro@example.com', 'ご予約ありがとうございます。\n到着は１５時頃です！',
    '𠮷野家', 'ｽｰﾊﾟｰ ﾙｰﾑ', 'こゝろ', '家族👨‍👩‍👧で旅行🎉', 'キーキャップ1️⃣#️⃣', '佐々木〆切', 'José Müller', '김철수', '①㉑',
  ]

  it.each(samples)('%s: 文字数・種類・幅・記号の位置が元と同じ', (input) => {
    const out = maskString(input, seededRng(1))
    const a = Array.from(input)
    const b = Array.from(out)
    expect(b.length).toBe(a.length)
    a.forEach((ch, i) => {
      const cls = CLASSES.find(([, re]) => re.test(ch))
      if (KEPT.includes(ch)) {
        expect(b[i], `記号 ${JSON.stringify(ch)} は残す`).toBe(ch)
      } else if (cls) {
        expect(cls[2](b[i]), `${cls[0]} ${ch} → ${b[i]}`).toBe(true)
      } else if (!/[\p{L}\p{Nd}\p{Nl}]/u.test(ch)) {
        expect(b[i], `記号 ${JSON.stringify(ch)} は残す`).toBe(ch)
      }
    })
  })

  it('キーキャップの数字と記号はそのまま残す', () => {
    expect(maskString('1️⃣#️⃣', seededRng(2))).toBe('1️⃣#️⃣')
  })

  it('アクセント付きラテン文字は半角英字、ハングルは漢字に置き換える', () => {
    const [e, , , , , ue] = Array.from(maskString('éabcdü', seededRng(3)))
    expect(e).toMatch(/^[a-z]$/)
    expect(ue).toMatch(/^[a-z]$/)
    Array.from(maskString('김철수', seededRng(3))).forEach((ch) => expect(KANJI_POOL).toContain(ch))
  })

  it('元の値は残らない（十分な長さの名前で一致しない）', () => {
    expect(maskString('山田 太郎', seededRng(4))).not.toBe('山田 太郎')
  })

  it('同じ入力でも乱数が違えば結果が変わる（ハッシュではない）', () => {
    expect(maskString('山田太郎', seededRng(5))).not.toBe(maskString('山田太郎', seededRng(6)))
  })

  it('漢字の置き換え先は80字で、すべて重複しない', () => {
    expect(KANJI_POOL).toHaveLength(80)
    expect(new Set(KANJI_POOL).size).toBe(80)
  })
})

describe('maskDouble / maskIntString（数値）', () => {
  const digitShape = (n: number) => {
    const [mantissa, exponent] = Math.abs(n).toString().split('e')
    const [i, f] = mantissa.split('.')
    return { sign: Math.sign(n), intLen: i.length, fracLen: f?.length ?? 0, exponent }
  }

  it.each([1.5, 12345.678, -0.25, 7, -98765, 0.001, 123456789.5, 1e21, 5e-7, 1.25e-10])('%s: 桁数・整数か小数か・符号を保つ', (value) => {
    for (let seed = 0; seed < 30; seed++) {
      const out = maskDouble(value, seededRng(seed))
      expect(digitShape(out)).toEqual(digitShape(value))
      expect(Number.isInteger(out)).toBe(Number.isInteger(value))
    }
  })

  it('0 は 0 のまま', () => {
    expect(maskDouble(0, seededRng(1))).toBe(0)
    expect(maskIntString('0', seededRng(1))).toBe('0')
  })

  it.each(['7', '42', '-42', '9007199254740993', '-100000'])('integerValue %s: 桁数と符号を保つ', (value) => {
    for (let seed = 0; seed < 30; seed++) {
      const out = maskIntString(value, seededRng(seed))
      expect(out.startsWith('-')).toBe(value.startsWith('-'))
      expect(out.replace('-', '')).toHaveLength(value.replace('-', '').length)
      expect(out).toMatch(/^-?[1-9]\d*$/)
    }
  })
})

describe('maskValue（値の種類ごと）', () => {
  const ctx = { rng: seededRng(1), remapId: (id: string) => `new-${id}` }

  it.each([
    ['空文字', ''],
    ['null', null],
    ['真偽値', true],
    ['NaN', { $t: 'number', v: 'NaN' }],
    ['Infinity', { $t: 'number', v: 'Infinity' }],
    ['-0', { $t: 'number', v: '-0' }],
    ['Timestamp（日付はずらさない）', { $t: 'timestamp', s: 1767225600, n: 5 }],
  ])('%s はそのまま', (_, value) => {
    expect(maskValue(value, ctx)).toEqual(value)
  })

  it('integerValue は int タグのまま桁数を保つ', () => {
    const out = maskValue({ $t: 'int', v: '32000' }, ctx) as { $t: string; v: string }
    expect(out.$t).toBe('int')
    expect(out.v).toHaveLength(5)
  })

  it('GeoPoint は (0, 0)、Bytes は同じ長さ、Reference は ID だけ振り直す', () => {
    expect(maskValue({ $t: 'geopoint', lat: 35.6, lng: 139.7 }, ctx)).toEqual({ $t: 'geopoint', lat: 0, lng: 0 })
    const bytes = maskValue({ $t: 'bytes', b64: Buffer.from('abcdef').toString('base64') }, ctx) as { b64: string }
    expect(Buffer.from(bytes.b64, 'base64')).toHaveLength(6)
    expect(maskValue({ $t: 'ref', path: 'guestInfoV2/abc/sub/def' }, ctx)).toEqual({ $t: 'ref', path: 'guestInfoV2/new-abc/sub/new-def' })
  })

  it('配列とマップは再帰的にマスクし、キーと構造を保つ', () => {
    const out = maskValue({ a: ['山田', null, { b: 'x1' }], $t: 'not-a-tag' }, ctx) as { $t: string; v: Record<string, unknown> }
    expect(out.$t).toBe('map')
    expect(Object.keys(out.v)).toEqual(['a', '$t'])
    const [s, n, inner] = out.v.a as [string, null, { b: string }]
    expect(Array.from(s)).toHaveLength(2)
    expect(n).toBeNull()
    expect(inner.b).toMatch(/^[a-z][0-9]$/)
  })
})
