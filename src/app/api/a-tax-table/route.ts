import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getATaxTableUseCase } from '@/application/aTaxTable/getATaxTableUseCase'
import { verifySession } from '@/lib/auth/verifySession'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'

const QuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2099),
  month: z.coerce.number().int().min(1).max(12),
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
  const parsed = QuerySchema.safeParse({
    year: searchParams.get('year'),
    month: searchParams.get('month'),
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const data = await getATaxTableUseCase(parsed.data.year, parsed.data.month)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof InfraError) {
      const status = infraErrorToStatus(e.code)
      logger.error('ATaxTable取得 InfraError', { infraErrorCode: e.code, message: e.message })
      notifySlackFireAndForget(`[ALERT] ATaxTable取得エラー(${e.code}): ${e.message}`)
      return NextResponse.json({ error: 'internal server error' }, { status })
    }
    logger.error('ATaxTable取得 想定外エラー', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] ATaxTable取得で想定外エラー: ${String(e)}`)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
