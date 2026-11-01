import { NextResponse } from 'next/server'
import { z } from 'zod'
import { firestoreReservationRepository } from '@/infra/reservation/firestoreReservationRepository'
import { handleRouteError, requireSession } from '@/lib/api/routeHelpers'
import { DocumentIdSchema } from '@/lib/api/documentIdSchema'

const BodySchema = z.object({
  a_tax_received: z.boolean().optional(),
  a_tax_received_by_staff_name: z.string().max(100).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'patch must not be empty' })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireSession(request, 'A税更新')
  if (unauthorized) return unauthorized

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
    await firestoreReservationRepository.updateATax(id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleRouteError(e, 'A税更新')
  }
}
