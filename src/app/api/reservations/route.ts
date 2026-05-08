import { NextResponse } from 'next/server'
import { z } from 'zod'
import { addReservationCommand } from '@/application/guestInfo/addReservationCommand'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'
import { ROOM_NUMBERS } from '@/constants/room'

const BOOKING_SITES = ['chillnn', 'booking.com', 'expedia', 'other'] as const

const BodySchema = z.object({
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room: z.enum(ROOM_NUMBERS),
  adult_count: z.number().int().min(0).max(9),
  child_count: z.number().int().min(0).max(9),
  guest_name: z.string().min(1).max(100),
  booking_site: z.enum(BOOKING_SITES),
  add_reason: z.string().min(1).max(500),
  staff_name: z.string().min(1).max(100),
}).refine((d) => d.check_out_date > d.check_in_date, {
  message: 'check_out_date must be after check_in_date',
})

export async function POST(request: Request) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const reservationNumber = await addReservationCommand(parsed.data)
    return NextResponse.json({ reservation_number: reservationNumber }, { status: 201 })
  } catch (e) {
    return handleRouteError(e, '予約追加')
  }
}
