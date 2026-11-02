// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildShapeReport, buildSizeReport, diffShapeReports, DOC_ID_PATH, MAIL_MEMO_MONTH_DAY_PATH } from '../../../scripts/localdev/lib/shapeReport'
import { isValidIsoDateTime, isValidMonthDay } from '../../../scripts/localdev/lib/dateValidity'
import type { CollectionDocuments } from '../../../scripts/localdev/lib/transform'

const docs = (): CollectionDocuments => ({
  guestInfoV2: [
    { id: 'a', data: { check_in_date: '2026/01/05', check_out_date: '2026/01/06', guest_name: '秘密の名前', adult_count: { $t: 'int', v: '2' },
      total_price: { $t: 'number', v: 'NaN' }, mail_memo: [{ month: '2', day: '29' }, { month: '2', day: '30' }, { month: '13', day: '1' }] } },
    { id: 'b', data: { check_in_date: '2026-01-05', check_out_date: '2026/02/30', guest_name: '', adult_count: 2.5, room: null } },
    { id: 'c', data: { check_in_date: '2026/13/99', check_out_date: '2026/02/28' } },
  ],
  dailyInfo: [
    { id: '2026-01-05', data: { date: '2026-01-05', updated_at: '2026-01-05T10:00:00+09:00' } },
    { id: '2026-13-99', data: { date: '2026-02-30', updated_at: '2026-01-05T25:00:00Z' } },
  ],
})

describe('buildShapeReport（AC-23）', () => {
  const report = buildShapeReport(docs(), '2026-10-31')
  const g = report.collections.guestInfoV2.fields
  const d = report.collections.dailyInfo.fields

  it('書式違いと実在しない日付を破損日付として数える', () => {
    expect(g.check_in_date.corruptedDate).toBe(2) // 2026-01-05（書式違い）, 2026/13/99
    expect(g.check_out_date.corruptedDate).toBe(1) // 2026/02/30
    expect(d[DOC_ID_PATH].corruptedDate).toBe(1)
    expect(d.date.corruptedDate).toBe(1)
    expect(d.updated_at.corruptedDate).toBe(1)
    expect(g[MAIL_MEMO_MONTH_DAY_PATH].corruptedDate).toBe(2) // 2/30, 13/1（2/29 は可）
  })

  it('型ごとの件数と欠損を数える', () => {
    expect(g.adult_count).toEqual({ integer: 1, double: 1, missing: 1 })
    expect(g.guest_name).toEqual({ string: 1, emptyString: 1, missing: 1 })
    expect(g.total_price).toEqual({ NaN: 1, missing: 2 })
    expect(g.room).toEqual({ null: 1, missing: 2 })
    expect(g['mail_memo[].month']).toEqual({ string: 3 })
    expect(report.collections.guestInfoV2.docCount).toBe(3)
  })

  it('レポートに値を含めない', () => {
    const json = JSON.stringify(report)
    for (const value of ['秘密の名前', '2026/01/05', '2026-01-05T10:00:00+09:00', '2026/13/99']) expect(json).not.toContain(value)
  })
})

describe('diffShapeReports（AC-24）', () => {
  const base = buildShapeReport(docs(), 'prev')

  it('前回のレポートがなければ警告しない', () => {
    expect(diffShapeReports(null, base)).toEqual([])
  })

  it('同じ形なら警告しない。件数の増減だけでも警告しない', () => {
    const more = docs()
    more.guestInfoV2.push({ id: 'd', data: { check_in_date: '2026/03/01', check_out_date: '2026/03/02', adult_count: { $t: 'int', v: '1' } } })
    expect(diffShapeReports(base, buildShapeReport(more, 'now'))).toEqual([])
  })

  it('型の種類が増えたフィールドと新しいフィールドを警告する', () => {
    const changed = docs()
    changed.guestInfoV2[2].data.adult_count = '3'
    changed.guestInfoV2[2].data.brand_new = true
    const warnings = diffShapeReports(base, buildShapeReport(changed, 'now'))
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('guestInfoV2.adult_count: 型の種類が増えた（string）'),
      expect.stringContaining('guestInfoV2.brand_new: 新しいフィールド'),
    ]))
  })
})

describe('buildSizeReport（T7-4）', () => {
  const report = buildSizeReport(docs(), '2026-11-02')
  const g = report.collections.guestInfoV2

  it('フィールドごとの文字列の最大長と配列の最大件数を数える', () => {
    expect(g.guest_name).toEqual({ maxLength: 5 }) // '秘密の名前' と ''
    expect(g.mail_memo).toEqual({ maxItems: 3 })
    expect(g['mail_memo[].month']).toEqual({ maxLength: 2 })
    expect(g.check_in_date).toEqual({ maxLength: 10 })
    expect(g.adult_count).toBeUndefined() // 数値は数えない
    expect(report.collections.dailyInfo.updated_at).toEqual({ maxLength: 25 })
  })

  it('文字数は画面の maxLength と同じ UTF-16 の length で数える', () => {
    const input = docs()
    input.guestInfoV2[0].data.guest_name = '𠮷野' // 𠮷 はサロゲートペア（length 2）
    expect(buildSizeReport(input, 'x').collections.guestInfoV2.guest_name).toEqual({ maxLength: 3 })
  })

  it('レポートに値を含めない', () => {
    const json = JSON.stringify(report)
    for (const value of ['秘密の名前', '2026/01/05', '2026-01-05T10:00:00+09:00']) expect(json).not.toContain(value)
  })
})

describe('日付の判定', () => {
  it.each([
    ['2026-01-05T10:00:00+09:00', true], ['2026-01-05T10:00Z', true], ['2026-01-05T10:00:00.123Z', true],
    ['2026-02-30T10:00:00Z', false], ['2026-01-05 10:00:00', false], ['2026-01-05T24:00:00Z', false],
  ])('ISO 8601 %s → %s', (v, ok) => expect(isValidIsoDateTime(v)).toBe(ok))

  it.each([['2', '29', true], ['2', '30', false], ['4', '31', false], ['12', '31', true], ['02', '1', false], ['0', '1', false]])(
    'mail_memo 月 %s 日 %s → %s', (m, d, ok) => expect(isValidMonthDay(m, d)).toBe(ok))
})
