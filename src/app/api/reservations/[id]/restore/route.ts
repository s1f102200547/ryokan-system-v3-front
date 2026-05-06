import { NextResponse } from 'next/server'
import { z } from 'zod'
import { restoreReservationCommand } from '@/application/guestInfo/restoreReservationCommand'
import { verifySession } from '@/lib/auth/verifySession'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'

const BodySchema = z.object({
  reservation_number: z.string(),
  guest_name: z.string(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(500),
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionCookie = parseCookieValue(request.headers.get('cookie'), 'session')
  const session = await verifySession(sessionCookie)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await restoreReservationCommand({
      id,
      reservationNumber: parsed.data.reservation_number,
      guestName: parsed.data.guest_name,
      targetDate: parsed.data.target_date,
      reason: parsed.data.reason,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof InfraError) {
      const status = infraErrorToStatus(e.code)
      logger.error('予約復活 InfraError', { infraErrorCode: e.code, message: e.message })
      notifySlackFireAndForget(`[ALERT] 予約復活エラー(${e.code}): ${e.message}`)
      return NextResponse.json({ error: 'internal server error' }, { status })
    }
    logger.error('予約復活 想定外エラー', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] 予約復活で想定外エラー: ${String(e)}`)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
