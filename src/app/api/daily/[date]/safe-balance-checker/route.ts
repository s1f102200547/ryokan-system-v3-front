import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'
import { PathDateSchema } from '@/lib/api/dateSchema'

const BodySchema = z.object({
  staffName: z.string().min(1).max(100),
})

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { date } = await params
  if (!PathDateSchema.safeParse(date).success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  try {
    const checkers = await firestoreDailyRepository.fetchSafeBalanceCheckers([date])
    return NextResponse.json({ staffName: checkers[date] ?? '' })
  } catch (e) {
    return handleRouteError(e, '締めスタッフ取得')
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { date } = await params
  if (!PathDateSchema.safeParse(date).success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await firestoreDailyRepository.updateSafeBalanceChecker(date, parsed.data.staffName)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, '締めスタッフ更新')
  }
}
