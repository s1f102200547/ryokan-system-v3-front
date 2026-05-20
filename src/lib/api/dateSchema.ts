import { z } from 'zod'
import { getTodayJST, dateDiff, DATE_RANGE_PAST_DAYS, DATE_RANGE_FUTURE_DAYS } from '@/lib/dateUtils'

function isRealDate(v: string): boolean {
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d
}

function isInRange(v: string): boolean {
  const diff = dateDiff(getTodayJST(), v)
  return diff >= -DATE_RANGE_PAST_DAYS && diff <= DATE_RANGE_FUTURE_DAYS
}

export const QueryDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate, '存在しない日付です')
    .refine(isInRange, '日付が許容範囲外です'),
})

export const PathDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, '存在しない日付です')
  .refine(isInRange, '日付が許容範囲外です')
