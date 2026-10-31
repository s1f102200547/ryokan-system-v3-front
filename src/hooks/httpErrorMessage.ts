// API の失敗（HTTP status）を画面に出す日本語メッセージにする。
// Slack に通知されるのは 5xx だけなので、400 / 404 では「管理者に通知済み」と言わない（BugHunting.md #18）
export type RequestKind = 'fetch' | 'save'

export function httpErrorMessage(status: number, kind: RequestKind, serverErrorMessage: string): string {
  if (status === 503) return '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'
  if (status === 404) return '対象の予約が見つかりません。画面を再読み込みしてください。'
  if (status === 400) {
    return kind === 'fetch'
      ? 'この日付は表示できません。日付を選び直してください。'
      : '入力内容に誤りがあるため保存できませんでした。画面を再読み込みして入力し直してください。'
  }
  return serverErrorMessage
}
