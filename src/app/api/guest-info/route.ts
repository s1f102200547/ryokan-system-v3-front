import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getGuestInfoUseCase } from '@/application/guestInfo/getGuestInfoUseCase'
import { verifySession } from '@/lib/auth/verifySession'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

export async function GET(request: Request) {
  const sessionCookie = parseCookieValue(request.headers.get('cookie'), 'session')
  const session = await verifySession(sessionCookie)
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  try {
    const data = await getGuestInfoUseCase(parsed.data.date)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof InfraError) {
      const status = infraErrorToStatus(e.code)
      logger.error('guestInfo取得 InfraError', { infraErrorCode: e.code, httpStatus: status, message: e.message })
      notifySlackFireAndForget(`[ALERT] guestInfo取得エラー(${e.code}): ${e.message}`)
      return NextResponse.json({ error: 'internal server error' }, { status })
    }
    logger.error('guestInfo取得 想定外エラー', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] guestInfo取得で想定外エラー: ${String(e)}`)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
