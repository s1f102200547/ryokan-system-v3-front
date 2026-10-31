import { NextResponse } from 'next/server'
import { getTimetableUseCase } from '@/application/timetable/getTimetableUseCase'
import { handleRouteError, requireSession } from '@/lib/api/routeHelpers'
import { QueryDateSchema } from '@/lib/api/dateSchema'

export async function GET(request: Request) {
  const unauthorized = await requireSession(request, 'タイムテーブル取得')
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(request.url)
  const parsed = QueryDateSchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  try {
    const data = await getTimetableUseCase(parsed.data.date)
    return NextResponse.json(data)
  } catch (e) {
    return handleRouteError(e, 'タイムテーブル取得')
  }
}
