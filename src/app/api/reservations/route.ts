import { NextResponse } from 'next/server'
import { z } from 'zod'
import { addReservationCommand } from '@/application/guestInfo/addReservationCommand'
import { verifySession } from '@/lib/auth/verifySession'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { ROOM_NUMBERS } from '@/constants/room'

const BOOKING_SITES = ['chillnn', 'booking.com', 'expedia', 'other'] as const

const BodySchema = z.object({
  check_in_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  room: z.enum(ROOM_NUMBERS),
  adult_count: z.number().int().min(1).max(9),
  child_count: z.number().int().min(0).max(9),
  guest_name: z.string().min(1).max(100),
  booking_site: z.enum(BOOKING_SITES),
  add_reason: z.string().min(1).max(500),
}).refine((d) => d.check_out_date > d.check_in_date, {
  message: 'check_out_date must be after check_in_date',
})

function parseCookieValue(cookieHeader: string | null, key: string): string | undefined {
  if (!cookieHeader) return undefined
  const prefix = `${key}=`
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length)
}

export async function POST(request: Request) {
  const sessionCookie = parseCookieValue(request.headers.get('cookie'), 'session')
  const session = await verifySession(sessionCookie)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const reservationNumber = await addReservationCommand(parsed.data)
    return NextResponse.json({ reservation_number: reservationNumber }, { status: 201 })
  } catch (e) {
    if (e instanceof InfraError) {
      const status = infraErrorToStatus(e.code)
      logger.error('予約追加 InfraError', { infraErrorCode: e.code, message: e.message })
      notifySlackFireAndForget(`[ALERT] 予約追加エラー(${e.code}): ${e.message}`)
      return NextResponse.json({ error: 'internal server error' }, { status })
    }
    logger.error('予約追加 想定外エラー', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] 予約追加で想定外エラー: ${String(e)}`)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
