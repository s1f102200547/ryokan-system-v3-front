import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getGuestInfoUseCase } from '@/application/guestInfo/getGuestInfoUseCase'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: Request) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({ date: searchParams.get('date') })
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
