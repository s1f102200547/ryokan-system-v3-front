import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cancelReservationCommand } from '@/application/guestInfo/cancelReservationCommand'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'
import { DocumentIdSchema } from '@/lib/api/documentIdSchema'
import { DateSchema } from '@/lib/api/dateSchema'

const BodySchema = z.object({
  staff_name: z.string().min(1).max(100),
  target_date: DateSchema,
  reason: z.string().min(1).max(500),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  if (!DocumentIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await cancelReservationCommand({
      id,
      staffName: parsed.data.staff_name,
      targetDate: parsed.data.target_date,
      reason: parsed.data.reason,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, 'キャンセル')
  }
}
