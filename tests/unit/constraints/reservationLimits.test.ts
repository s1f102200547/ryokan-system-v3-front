// @vitest-environment node
//
// 予約の書き込みの上限: 上限ちょうどは通し、上限+1 は拒否する
import { describe, it, expect } from 'vitest'
import { ReservationPatchBodySchema } from '@/lib/api/reservationSchemas'
import { MAX_ADULT_COUNT, MAX_NIGHTS, RESERVATION_LIMITS as L } from '@/constants/guestInfo'

const text = (n: number) => 'あ'.repeat(n)

const mailMemo = (overrides: Record<string, string> = {}) => ({
  month: '1', day: '1', name: '', summary: '', text: '', source: '', ...overrides,
})

// [名前, 上限の値から PATCH body を作る関数, 上限]
const limitCases: [string, (n: number) => Record<string, unknown>, number][] = [
  ['other_note の文字数', (n) => ({ other_note: text(n) }), L.otherNoteLength],
  ['profession の文字数', (n) => ({ profession: text(n) }), L.professionLength],
  ['group_type の文字数', (n) => ({ group_type: text(n) }), L.selectValueLength],
  ['purpose の文字数', (n) => ({ purpose: text(n) }), L.selectValueLength],
  ['tourism_type の文字数', (n) => ({ tourism_type: text(n) }), L.selectValueLength],
  ['age_groups の要素の文字数', (n) => ({ age_groups: [text(n)] }), L.selectValueLength],
  ['age_groups の件数', (n) => ({ age_groups: Array<null>(n).fill(null) }), MAX_ADULT_COUNT],
  ['dinner_info の要素の文字数', (n) => ({ dinner_info: [text(n)] }), L.dinnerInfoLength],
  ['timetable_info の要素の文字数', (n) => ({ timetable_info: [text(n)] }), L.timetableInfoLength],
  ['dinner_time の件数', (n) => ({ dinner_time: Array(n).fill('NONE') }), MAX_NIGHTS],
  ['dinner_info の件数', (n) => ({ dinner_info: Array(n).fill('') }), MAX_NIGHTS],
  ['breakfast_time の件数', (n) => ({ breakfast_time: Array(n).fill(null) }), MAX_NIGHTS],
  ['open_air_bath_time の件数', (n) => ({ open_air_bath_time: Array(n).fill(null) }), MAX_NIGHTS],
  ['timetable_info の件数', (n) => ({ timetable_info: Array(n).fill('') }), MAX_NIGHTS],
  ['mail_memo の件数', (n) => ({ mail_memo: Array.from({ length: n }, () => mailMemo()) }), L.mailMemoItems],
  ['mail_memo の month の文字数', (n) => ({ mail_memo: [mailMemo({ month: '1'.repeat(n) })] }), L.mailMemoMonthDayLength],
  ['mail_memo の day の文字数', (n) => ({ mail_memo: [mailMemo({ day: '1'.repeat(n) })] }), L.mailMemoMonthDayLength],
  ['mail_memo の name の文字数', (n) => ({ mail_memo: [mailMemo({ name: text(n) })] }), L.mailMemoNameLength],
  ['mail_memo の summary の文字数', (n) => ({ mail_memo: [mailMemo({ summary: text(n) })] }), L.mailMemoSummaryLength],
  ['mail_memo の text の文字数', (n) => ({ mail_memo: [mailMemo({ text: text(n) })] }), L.mailMemoTextLength],
  ['mail_memo の source の文字数', (n) => ({ mail_memo: [mailMemo({ source: text(n) })] }), L.mailMemoSourceLength],
]

describe('PATCH の上限', () => {
  it.each(limitCases)('%s: 上限ちょうどは通す', (_label, build, limit) => {
    expect(ReservationPatchBodySchema.safeParse(build(limit)).success).toBe(true)
  })

  it.each(limitCases)('%s: 上限+1 は拒否する', (_label, build, limit) => {
    expect(ReservationPatchBodySchema.safeParse(build(limit + 1)).success).toBe(false)
  })

  // Zod 4 はコードポイントで数える。画面の maxLength（UTF-16）より緩いので、画面で入力できる値は必ず通る
  it('文字数はコードポイントで数える（サロゲートペアも1文字）', () => {
    expect(ReservationPatchBodySchema.safeParse({ profession: '𠮷'.repeat(L.professionLength) }).success).toBe(true)
    expect(ReservationPatchBodySchema.safeParse({ profession: '𠮷'.repeat(L.professionLength + 1) }).success).toBe(false)
  })

  it('null を許すフィールドは、上限があっても null を通す', () => {
    expect(ReservationPatchBodySchema.safeParse({ group_type: null, purpose: null, tourism_type: null, age_groups: [null] }).success)
      .toBe(true)
  })
})
