import { NextResponse } from 'next/server'
import { z } from 'zod'
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

// 未ログインなら 401、Firebase Auth の障害なら handleRouteError（503 + 通知）の Response を返す。ログイン済みなら null。
// セッションの確認も handleRouteError を通す。try の外で呼ぶと、Auth の障害で全 API が 500 になり、
// ログにも Slack にも残らなかった（BugHunting.md #23）
export async function requireSession(request: Request, label: string): Promise<NextResponse | null> {
  try {
    const session = await getSession(request)
    return session ? null : NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  } catch (e) {
    return handleRouteError(e, label)
  }
}

export async function getSession(request: Request) {
  const sessionCookie = parseCookieValue(request.headers.get('cookie'), 'session')
  return verifySession(sessionCookie)
}

// 元の例外を文字列にする。InfraError の message だけでは原因が分からない（例: RangeError が "Firestore unknown error" になる。BugHunting.md #16）
function describeCause(cause: unknown): string | undefined {
  if (cause === undefined) return undefined
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
}

// 入力の検証（Zod）に失敗したときの 400（T7-5）。
// production では、どのフィールドがどの条件に違反したか（details）を返さない。上限や許容値など、スキーマの手がかりになるため。
// 調べられるよう、ログには場所（path）と違反の種類（code）だけを残す。入力の値とメッセージは出さない（個人情報が入りうる）。
// development / test では、原因が分かるよう今までどおり details を返す。hooks は details を使っていない
export function invalidInputResponse(label: string, error: string, zodError: z.ZodError): NextResponse {
  const issues = zodError.issues.map((i) => ({ path: i.path.map(String).join('.'), code: i.code }))
  logger.warn(`${label} 入力の検証に失敗`, { issues })
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ error, details: z.flattenError(zodError) }, { status: 400 })
}

export function handleRouteError(e: unknown, label: string): NextResponse {
  if (e instanceof InfraError) {
    const status = infraErrorToStatus(e.code)
    const cause = describeCause(e.cause)
    // 存在しないドキュメントへの操作は入力が原因。人が対応する障害ではないので通知しない（BugHunting.md #5）
    if (e.code === 'FIRESTORE_NOT_FOUND') {
      logger.warn(`${label} 対象なし`, { infraErrorCode: e.code, message: e.message, cause })
      return NextResponse.json({ error: 'not found' }, { status })
    }
    logger.error(`${label} InfraError`, { infraErrorCode: e.code, message: e.message, cause })
    notifySlackFireAndForget(`[ALERT] ${label}エラー(${e.code}): ${e.message}`)
    return NextResponse.json({ error: 'internal server error' }, { status })
  }
  logger.error(`${label} 想定外エラー`, { message: String(e) })
  notifySlackFireAndForget(`[ALERT] ${label}で想定外エラー: ${String(e)}`)
  return NextResponse.json({ error: 'internal server error' }, { status: 500 })
}
