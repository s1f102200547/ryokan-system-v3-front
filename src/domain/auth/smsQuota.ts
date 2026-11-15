import { MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

// 1アカウントが1日（JST）に送れる SMS の数の判定（純粋）。保存は infra/auth/firestoreSmsQuotaRepository.ts。
// 送る前に数える（Firebase の失敗で送れなかった分も戻さない。上限に近づくのは障害が続いたときだけで、そのときは Slack に出ている）
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
