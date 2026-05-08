import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth/verifySession'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'

// Cookie ヘッダーから指定キーの値を取り出す
// .split('=') ではなく startsWith で先頭一致させることで、値に '=' が含まれる場合（JWT 等）も正しく取得できる
export function parseCookieValue(cookieHeader: string | null, key: string): string | undefined {
  if (!cookieHeader) return undefined
  const prefix = `${key}=`
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length)
}

export async function getSession(request: Request) {
  const sessionCookie = parseCookieValue(request.headers.get('cookie'), 'session')
  return verifySession(sessionCookie)
}

export function handleRouteError(e: unknown, label: string): NextResponse {
  if (e instanceof InfraError) {
    const status = infraErrorToStatus(e.code)
    logger.error(`${label} InfraError`, { infraErrorCode: e.code, message: e.message })
    notifySlackFireAndForget(`[ALERT] ${label}エラー(${e.code}): ${e.message}`)
    return NextResponse.json({ error: 'internal server error' }, { status })
  }
  logger.error(`${label} 想定外エラー`, { message: String(e) })
  notifySlackFireAndForget(`[ALERT] ${label}で想定外エラー: ${String(e)}`)
  return NextResponse.json({ error: 'internal server error' }, { status: 500 })
}
