import { MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

// 1アカウントが1日（JST）に送れる SMS の数の判定（純粋）。保存は infra/auth/firestoreSmsQuotaRepository.ts。
// 送る前に数え（送ってから数えると、同時に送られたときに上限を超える）、送っていないことが確かな分（Firebase がエラーの応答を返した:
// reCAPTCHA で断られた・Firebase が止めた・振り分けにないエラー）は refundSms で戻す。数えるのは送れた SMS（F-01）。
// 送れたかが分からない（応答がない・200 なのに sessionInfo がない）分は戻さない（application/auth/startMfaCommand.ts）
export type SmsQuotaState = { date: string; count: number } // date は YYYY-MM-DD（JST）

export type SmsQuotaDecision = {
  allowed: boolean
  firstRejection: boolean // 今日はじめて断った（Slack に知らせるのは1回だけ）
  next: SmsQuotaState
}

export function consumeSms(state: SmsQuotaState | null, today: string, limit: number = MFA_SMS_DAILY_LIMIT): SmsQuotaDecision {
  const count = state !== null && state.date === today ? Math.max(0, state.count) : 0
  const allowed = count < limit
  // 断った後も1つだけ足す（limit + 1 で止める）。limit ちょうどから断ったときが「はじめて」
  return { allowed, firstRejection: count === limit, next: { date: today, count: Math.min(count + 1, limit + 1) } }
}

// 送れなかった1通を戻す。今日の数でなければ（日をまたいだ・記録がない）何もしない（null）。0 より下げない
export function refundSms(state: SmsQuotaState | null, today: string): SmsQuotaState | null {
  if (state === null || state.date !== today) return null
  return { date: today, count: Math.max(0, state.count - 1) }
}
