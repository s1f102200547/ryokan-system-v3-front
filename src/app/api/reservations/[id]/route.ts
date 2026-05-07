import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateReservationCommand } from '@/application/guestInfo/updateReservationCommand'
import { getSession, handleRouteError } from '@/lib/api/routeHelpers'
import { ROOM_NUMBERS } from '@/constants/room'

const MailMemoEntrySchema = z.object({
  month:   z.string(),
  day:     z.string(),
  name:    z.string(),
  summary: z.string(),
  text:    z.string(),
  source:  z.string(),
})

// ReservationPatch の部分更新を受け付ける（全フィールドoptional）
const PatchBodySchema = z.object({
  guest_name:                    z.string().max(100).optional(),
  room:                          z.enum(ROOM_NUMBERS).nullable().optional(),
  adult_count:                   z.number().int().min(0).max(9).optional(),
  child_count:                   z.number().int().min(0).max(9).optional(),
  check_out_date:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  arrival_time:                  z.string().nullable().optional(),
  late_out:                      z.number().int().min(0).max(1).optional(),
  dinner_time:                   z.array(z.string()).optional(),
  dinner_info:                   z.array(z.string()).optional(),
  breakfast_time:                z.array(z.string().nullable()).optional(),
  open_air_bath_time:            z.array(z.string().nullable()).optional(),
  timetable_info:                z.array(z.string()).optional(),
  mail_memo:                     z.array(MailMemoEntrySchema).optional(),
  a_tax_received:                z.boolean().optional(),
  a_tax_received_by_staff_name:  z.string().max(100).optional(),
  check_in_staff_name:           z.string().max(100).optional(),
  country:                       z.string().max(100).nullable().optional(),
  city:                          z.string().max(100).optional(),
  age_groups:                    z.array(z.string().nullable()).optional(),
  group_type:                    z.string().nullable().optional(),
  purpose:                       z.string().nullable().optional(),
  tourism_type:                  z.string().nullable().optional(),
  profession:                    z.string().optional(),
  other_note:                    z.string().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'patch must not be empty' })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
    return handleRouteError(e, '予約更新')
  }
}
