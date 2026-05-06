import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'

const BodySchema = z.object({
  received: z.boolean(),
  staffName: z.string().max(100),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await firestoreReservationRepository.updateATaxReceived(id, parsed.data.received, parsed.data.staffName)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, 'A税受領更新')
  }
}
