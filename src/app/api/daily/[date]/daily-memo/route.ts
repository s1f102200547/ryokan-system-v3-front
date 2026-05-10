import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'

const BodySchema = z.object({
  memo: z.string().max(2000),
})

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { date } = await params
  if (!DateSchema.safeParse(date).success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  try {
    const memo = await firestoreDailyRepository.fetchDailyMemo(date)
    return NextResponse.json({ memo })
  } catch (e) {
    return handleRouteError(e, '当日メモ取得')
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { date } = await params
  if (!DateSchema.safeParse(date).success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await firestoreDailyRepository.updateDailyMemo(date, parsed.data.memo)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, '当日メモ更新')
  }
}
