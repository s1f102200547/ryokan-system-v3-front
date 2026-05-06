import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'

const BodySchema = z.object({
  a_tax_received: z.boolean().optional(),
  a_tax_received_by_staff_name: z.string().max(100).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'patch must not be empty' })

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
    await firestoreReservationRepository.updateATax(id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, 'A税更新')
  }
}
