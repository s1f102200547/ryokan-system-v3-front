// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { treatmentOf } from '../../../scripts/localdev/lib/allowlist'
import { createIdRemapper } from '../../../scripts/localdev/lib/idRemap'
import { seededRng } from '../../../scripts/localdev/lib/rng'
import { anonymizeCollections, checkPreserved } from '../../../scripts/localdev/lib/transform'
import type { CollectionDocuments } from '../../../scripts/localdev/lib/transform'

const int = (n: number) => ({ $t: 'int', v: String(n) })

function sample(): CollectionDocuments {
  return {
    guestInfoV2: [
      { id: 'doc-A1', data: {
        reservation_number: 'RSV-1001', mail_id: '18c2f0a9b7e', guest_name: '山田 太郎', city: '東京都',
        check_in_date: '2026/10/31', check_out_date: '2026/11/01', room: '21', adult_count: int(2),
        source: 'gmail', country: 'Japan', remarks: '静かな部屋希望', new_field: '未知の値',
        mail_memo: [{ month: '10', day: '20', name: '山田 太郎', summary: '予約', text: '本文', source: 'booking', extra: '追加' }],
        dinner_time: ['18:00'], age_groups: ['30s', null],
      } },
      { id: 'doc-B2', data: { check_in_date: '2026-11-01', check_out_date: '2026/11/02', room: '', country: null, guest_name: 'Hanako' } },
      { id: 'doc-C3', data: { check_in_date: '2026/13/99', check_out_date: '2026/11/03', room: null, country: '' } },
      { id: 'doc-D4', data: { check_in_date: '2026/11/03', check_out_date: '2026/11/04' } },
    ],
    dailyInfo: [
      { id: '2026-10-31', data: {
        date: '2026-10-31', safeBalanceChecker: 'スタッフA', updated_at: '2026-10-31T09:00:00+09:00',
        todos: [{ id: 'todo-1', text: '玄関の掃除' }],
        source: { collection: 'legacyDaily', path: 'legacyDaily/2026-10-31', field: 'safeBalanceChecker' },
      } },
      { id: '2026-13-99', data: { date: '2026-13-99', todos: [{ id: 'RSV-1001', text: 'x' }] } },
    ],
  }
}

describe('許可リスト', () => {
  it('列挙したパスだけが残す / ID / シャッフルで、それ以外はマスク', () => {
    expect(treatmentOf('guestInfoV2', 'check_in_date')).toBe('keep')
    expect(treatmentOf('guestInfoV2', 'reservation_number')).toBe('id')
    expect(treatmentOf('guestInfoV2', 'country')).toBe('shuffle')
    expect(treatmentOf('guestInfoV2', 'guest_name')).toBe('mask')
    expect(treatmentOf('guestInfoV2', 'new_field')).toBe('mask')
    expect(treatmentOf('guestInfoV2', 'mail_memo[].unknown')).toBe('mask')
  })

  it('同じ名前でもパスが違えば別の扱い（guestInfoV2.source は残し、dailyInfo.source.path はマスク）', () => {
    expect(treatmentOf('guestInfoV2', 'source')).toBe('keep')
    expect(treatmentOf('dailyInfo', 'source.collection')).toBe('keep')
    expect(treatmentOf('dailyInfo', 'source.path')).toBe('mask')
    expect(treatmentOf('dailyInfo', 'source')).toBe('mask')
  })

  it('変換後: 許可リストにないフィールドはマスクされ、残すフィールドは元のまま', () => {
    const out = anonymizeCollections(sample(), seededRng(1))
    const g = out.guestInfoV2[0].data
    expect(g.new_field).not.toBe('未知の値')
    expect(Array.from(g.new_field as string)).toHaveLength(4)
    expect(g.guest_name).not.toBe('山田 太郎')
    expect(g.city).not.toBe('東京都')
    expect(g.source).toBe('gmail')
    expect(g.dinner_time).toEqual(['18:00'])
    expect(g.age_groups).toEqual(['30s', null])
    const memo = (g.mail_memo as Record<string, unknown>[])[0]
    expect([memo.month, memo.day, memo.source]).toEqual(['10', '20', 'booking'])
    expect(memo.name).not.toBe('山田 太郎')
    expect(memo.extra).not.toBe('追加')
    const d = out.dailyInfo[0].data as { source: Record<string, string>; safeBalanceChecker: string; todos: { text: string }[] }
    expect(d.source.collection).toBe('legacyDaily')
    expect(d.source.field).toBe('safeBalanceChecker')
    expect(d.source.path).not.toBe('legacyDaily/2026-10-31')
    expect(d.safeBalanceChecker).not.toBe('スタッフA')
    expect(d.todos[0].text).not.toBe('玄関の掃除')
  })
})

describe('日付と部屋', () => {
  it('日付（破損した日付を含む）と部屋番号は元の値のまま', () => {
    const input = sample()
    const out = anonymizeCollections(input, seededRng(2))
    out.guestInfoV2.forEach((doc, i) => {
      for (const f of ['check_in_date', 'check_out_date', 'room']) expect(doc.data[f]).toEqual(input.guestInfoV2[i].data[f])
    })
    expect(out.dailyInfo.map((d) => d.id)).toEqual(['2026-10-31', '2026-13-99'])
    expect(out.dailyInfo.map((d) => d.data.date)).toEqual(['2026-10-31', '2026-13-99'])
    expect(out.dailyInfo[0].data.updated_at).toBe('2026-10-31T09:00:00+09:00')
  })

  it('自己検査は値を出さず、一致件数を返す', () => {
    const input = sample()
    const checks = checkPreserved(input, anonymizeCollections(input, seededRng(3)))
    expect(checks.every((c) => c.mismatched === 0 && c.checked > 0)).toBe(true)
  })

  it('自己検査は不一致を検出する', () => {
    const input = sample()
    const out = anonymizeCollections(input, seededRng(3))
    out.guestInfoV2[0].data.room = '22'
    expect(checkPreserved(input, out).find((c) => c.collection === 'guestInfoV2')?.mismatched).toBe(1)
  })
})

describe('ID の振り直し', () => {
  it('同じ元の値には同じ新しい値、違う値には違う値。元の値とは一致しない', () => {
    const remapper = createIdRemapper(seededRng(4))
    const a = remapper.remap('RSV-1001')
    expect(remapper.remap('RSV-1001')).toBe(a)
    expect(remapper.remap('RSV-1002')).not.toBe(a)
    expect(a).not.toBe('RSV-1001')
    expect(a).toMatch(/^[A-Z]{3}-\d{4}$/)
  })

  it('UUID は UUID v4 に振り直す', () => {
    const out = createIdRemapper(seededRng(5)).remap('0190a8f2-1234-7abc-8def-0123456789ab')
    expect(out).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('コレクションをまたいで参照関係を保つ（guestInfoV2.reservation_number と dailyInfo.todos[].id）', () => {
    const out = anonymizeCollections(sample(), seededRng(6))
    const rsv = out.guestInfoV2[0].data.reservation_number
    const todoId = (out.dailyInfo[1].data.todos as { id: string }[])[0].id
    expect(rsv).not.toBe('RSV-1001')
    expect(todoId).toBe(rsv)
  })

  it('ドキュメント ID を振り直し、すべて異なる', () => {
    const ids = anonymizeCollections(sample(), seededRng(7)).guestInfoV2.map((d) => d.id)
    expect(new Set(ids).size).toBe(4)
    expect(ids).not.toContain('doc-A1')
  })

  it("'' はそのまま", () => {
    expect(createIdRemapper(seededRng(8)).remap('')).toBe('')
  })
})

describe('country のシャッフル', () => {
  it('値の多重集合（null と "" を含む）を保ち、欠損は欠損のまま', () => {
    const input = sample()
    for (let seed = 0; seed < 20; seed++) {
      const out = anonymizeCollections(input, seededRng(seed)).guestInfoV2
      const values = out.filter((d) => 'country' in d.data).map((d) => d.data.country)
      expect([...values].sort()).toEqual(['', 'Japan', null].sort())
      expect('country' in out[3].data).toBe(false)
    }
  })
})

describe('fixture 全体での性質', () => {
  const load = async (collection: string) => {
    const { readFileSync } = await import('node:fs')
    return JSON.parse(readFileSync(`tests/fixtures/localdev/${collection}.json`, 'utf8')).docs
  }

  it('変換しても形のレポートは変わらず、マスク対象の元の値は残らない', async () => {
    const { buildShapeReport } = await import('../../../scripts/localdev/lib/shapeReport')
    const input = { guestInfoV2: await load('guestInfoV2'), dailyInfo: await load('dailyInfo') } as CollectionDocuments
    for (let seed = 0; seed < 20; seed++) {
      const out = anonymizeCollections(input, seededRng(seed))
      expect(buildShapeReport(out, 'x')).toEqual(buildShapeReport(input, 'x'))
      const json = JSON.stringify(out)
      for (const secret of ['テスト 太郎', 'Test Hanako', '東京都', 'スタッフA', '玄関の掃除', 'FX-0001', 'mail-fx-0001']) {
        expect(json).not.toContain(secret)
      }
    }
  })
})
