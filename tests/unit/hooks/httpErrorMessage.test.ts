import { describe, it, expect } from 'vitest'
import { httpErrorMessage } from '@/hooks/httpErrorMessage'

// 400 / 404 は Slack に通知されないので「管理者に通知済み」と言わない
describe('httpErrorMessage', () => {
  const failure = '保存に失敗しました。管理者に通知済みです。'

  it('503 は一時的な失敗', () => {
    expect(httpErrorMessage(503, 'save', failure)).toBe('一時的に通信に失敗しました。しばらく待ってから再度お試しください。')
  })

  it('保存の 400 は入力の誤り', () => {
    expect(httpErrorMessage(400, 'save', failure))
      .toBe('入力内容に誤りがあるため保存できませんでした。画面を再読み込みして入力し直してください。')
  })

  it('表示の 400 は日付の選び直し', () => {
    expect(httpErrorMessage(400, 'fetch', failure)).toBe('この日付は表示できません。日付を選び直してください。')
  })

  it('404 は予約が見つからない', () => {
    expect(httpErrorMessage(404, 'save', failure)).toBe('対象の予約が見つかりません。画面を再読み込みしてください。')
  })

  it.each([400, 404])('%i では「管理者に通知済み」と言わない', (status) => {
    expect(httpErrorMessage(status, 'save', failure)).not.toContain('通知済み')
    expect(httpErrorMessage(status, 'fetch', failure)).not.toContain('通知済み')
  })

  it.each([500, 502])('%i は呼び出し側の文言', (status) => {
    expect(httpErrorMessage(status, 'save', failure)).toBe(failure)
  })
})
