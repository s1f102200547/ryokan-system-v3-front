import { NextResponse } from 'next/server'
import { addReservationCommand } from '@/application/guestInfo/addReservationCommand'
import { handleRouteError, requireSession, invalidInputResponse } from '@/lib/api/routeHelpers'
import { NewReservationBodySchema } from '@/lib/api/reservationSchemas'

export async function POST(request: Request) {
  const unauthorized = await requireSession(request, '予約追加')
  if (unauthorized) return unauthorized

  const body = await request.json().catch(() => null)
  const parsed = NewReservationBodySchema.safeParse(body)
  if (!parsed.success) {
    return invalidInputResponse('予約追加', 'invalid body', parsed.error)
  }

  try {
    const reservationNumber = await addReservationCommand(parsed.data)
    return NextResponse.json({ reservation_number: reservationNumber }, { status: 201 })
  } catch (e) {
    return handleRouteError(e, '予約追加')
  }
}
