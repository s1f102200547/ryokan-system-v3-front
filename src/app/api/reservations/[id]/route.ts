import { NextResponse } from 'next/server'
import { updateReservationCommand } from '@/application/guestInfo/updateReservationCommand'
import { handleRouteError, requireSession } from '@/lib/api/routeHelpers'
import { DocumentIdSchema } from '@/lib/api/documentIdSchema'
import { ReservationPatchBodySchema } from '@/lib/api/reservationSchemas'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireSession(request, '予約更新')
  if (unauthorized) return unauthorized

  const { id } = await params
  if (!DocumentIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const body = await request.json().catch(() => null)
  const parsed = ReservationPatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const result = await updateReservationCommand(id, parsed.data)
    if (!result.success) {
      if (result.error.kind === 'NOT_FOUND') {
        return NextResponse.json({ error: 'not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'invalid patch', violations: result.error.violations }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, '予約更新')
  }
}
