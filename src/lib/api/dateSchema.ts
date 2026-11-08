import { z } from 'zod'
import { getTodayJST, dateDiff, isRealDate } from '@/lib/dateUtils'
import { DATE_RANGE_PAST_DAYS, DATE_RANGE_FUTURE_DAYS } from '@/constants/date'

function isInRange(v: string): boolean {
  const diff = dateDiff(getTodayJST(), v)
  return diff >= -DATE_RANGE_PAST_DAYS && diff <= DATE_RANGE_FUTURE_DAYS
}

// YYYY-MM-DD で、実在し、今日（JST）から DATE_RANGE_PAST_DAYS 日前〜DATE_RANGE_FUTURE_DAYS 日後の日付
// 読み取りの query / path と、書き込みの body で共通に使う
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, '存在しない日付です')
  .refine(isInRange, '日付が許容範囲外です')

export const QueryDateSchema = z.object({
  date: DateSchema,
})

export const PathDateSchema = DateSchema
