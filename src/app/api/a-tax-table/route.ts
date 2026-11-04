import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getATaxTableUseCase } from '@/application/aTaxTable/getATaxTableUseCase'
import { handleRouteError, requireSession, invalidInputResponse } from '@/lib/api/routeHelpers'
import { isATaxTableMonth } from '@/lib/aTaxMonths'
import { getTodayJST } from '@/lib/dateUtils'

// 画面と同じ JST の今月・先月だけを受け付ける（他の月の宿泊客を一覧させない）
const QuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12),
}).refine((v) => isATaxTableMonth(v, getTodayJST()), { message: 'month is not selectable' })

export async function GET(request: Request) {
  const unauthorized = await requireSession(request, 'ATaxTable取得')
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    year: searchParams.get('year'),
    month: searchParams.get('month'),
  })
  if (!parsed.success) {
    return invalidInputResponse('ATaxTable取得', 'invalid query', parsed.error)
  }

  try {
    const data = await getATaxTableUseCase(parsed.data.year, parsed.data.month)
    return NextResponse.json(data)
  } catch (e) {
    return handleRouteError(e, 'ATaxTable取得')
  }
}
