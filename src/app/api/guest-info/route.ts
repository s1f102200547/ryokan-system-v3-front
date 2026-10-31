import { NextResponse } from 'next/server'
import { getGuestInfoUseCase } from '@/application/guestInfo/getGuestInfoUseCase'
import { handleRouteError, requireSession } from '@/lib/api/routeHelpers'
import { QueryDateSchema } from '@/lib/api/dateSchema'

export async function GET(request: Request) {
  const unauthorized = await requireSession(request, 'guestInfo取得')
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(request.url)
  const parsed = QueryDateSchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  try {
    const data = await getGuestInfoUseCase(parsed.data.date)
    return NextResponse.json(data)
  } catch (e) {
    return handleRouteError(e, 'guestInfo取得')
  }
}
