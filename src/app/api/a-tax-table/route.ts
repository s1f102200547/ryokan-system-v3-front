import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getATaxTableUseCase } from '@/application/aTaxTable/getATaxTableUseCase'
import { handleRouteError, requireSession } from '@/lib/api/routeHelpers'

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12),
})

export async function GET(request: Request) {
  const unauthorized = await requireSession(request, 'ATaxTable取得')
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    year: searchParams.get('year'),
    month: searchParams.get('month'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const data = await getATaxTableUseCase(parsed.data.year, parsed.data.month)
    return NextResponse.json(data)
  } catch (e) {
    return handleRouteError(e, 'ATaxTable取得')
  }
}
