import type { SmsQuotaDecision } from '@/domain/auth/smsQuota'

export interface SmsQuotaRepository {
  // 1通ぶん数える（読みと書きを1つのトランザクションで）。today は YYYY-MM-DD（JST）
  consume(email: string, today: string): Promise<SmsQuotaDecision>
}
