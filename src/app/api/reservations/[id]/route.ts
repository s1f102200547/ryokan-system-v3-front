import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateReservationCommand } from '@/application/guestInfo/updateReservationCommand'
import { verifySession } from '@/lib/auth/verifySession'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { ROOM_NUMBERS } from '@/constants/room'

// ReservationPatch の部分更新を受け付ける（全フィールドoptional）
const PatchBodySchema = z.object({
  guest_name:                    z.string().max(100).optional(),
  room:                          z.enum(ROOM_NUMBERS).optional(),
  adult_count:                   z.number().int().min(1).max(9).optional(),
  child_count:                   z.number().int().min(0).max(9).optional(),
  check_out_date:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  arrival_time:                  z.string().nullable().optional(),
  late_out:                      z.number().int().min(0).max(1).optional(),
  dinner_time:                   z.array(z.string()).optional(),
  dinner_info:                   z.array(z.string()).optional(),
  breakfast_time:                z.array(z.string().nullable()).optional(),
  open_air_bath_time:            z.array(z.string().nullable()).optional(),
  timetable_info:                z.array(z.string()).optional(),
  a_tax_received:                z.boolean().optional(),
  a_tax_received_by_staff_name:  z.string().max(100).optional(),
  check_in_staff_name:           z.string().max(100).optional(),
  country:                       z.string().max(100).optional(),
  city:                          z.string().max(100).optional(),
  age_groups:                    z.array(z.string()).optional(),
  group_type:                    z.string().optional(),
  purpose:                       z.string().optional(),
  tourism_type:                  z.string().optional(),
  profession:                    z.string().optional(),
  other_note:                    z.string().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'patch must not be empty' })

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
  const parsed = PatchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    await updateReservationCommand(id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof InfraError) {
      const status = infraErrorToStatus(e.code)
      logger.error('予約更新 InfraError', { infraErrorCode: e.code, message: e.message })
      notifySlackFireAndForget(`[ALERT] 予約更新エラー(${e.code}): ${e.message}`)
      return NextResponse.json({ error: 'internal server error' }, { status })
    }
    logger.error('予約更新 想定外エラー', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] 予約更新で想定外エラー: ${String(e)}`)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
