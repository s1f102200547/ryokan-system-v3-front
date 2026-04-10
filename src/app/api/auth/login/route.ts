import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminAuth } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'

// 認証失敗（ビジネス結果）として扱う Firebase Admin エラーコード
// これ以外はインフラ障害として 503 を返す
const CREDENTIAL_ERROR_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
])

// firebase-admin の FirebaseError は値ではなく型なので instanceof が使えない
// code プロパティの存在で判定する
function isFirebaseError(e: unknown): e is { code: string } {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string'
}

const BodySchema = z.object({
  idToken: z.string().min(1),
})

// 今日の 23:00 JST までの残り時間（ms）を返す
// ログイン時に Session Cookie の有効期限を当日 23:00 に合わせる（日次サイクル）
function msUntilToday23JST(): number {
  const nowMs = Date.now()
  const nowJST = new Date(nowMs + 9 * 60 * 60 * 1000) // UTC→JST

  // 今日の 23:00 JST = 14:00 UTC
  const expire23UTC = Date.UTC(
    nowJST.getUTCFullYear(),
    nowJST.getUTCMonth(),
    nowJST.getUTCDate(),
    14, 0, 0,
  )

  return Math.max(expire23UTC - nowMs, 5 * 60 * 1000) // Firebase の最低値 5分 を保証（5分未満にするとfirebaseがエラーを返すから）
}

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  // idToken の整合性検証（改ざん・期限切れ・無効トークンを弾く）
  try {
    await adminAuth.verifyIdToken(parsed.data.idToken)  // このユーザは本当にログイン済みか?
  } catch (e) {
    if (isFirebaseError(e) && CREDENTIAL_ERROR_CODES.has(e.code)) {
      // 認証失敗はビジネスロジックで処理する（インフラ障害ではない）
      logger.warn('ログイン失敗: idToken 検証エラー', { code: e.code })
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    // ネットワーク障害・Firebase サービス障害などはインフラ障害として 503
    logger.error('ログイン idToken 検証 インフラ障害', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] idToken 検証でインフラ障害: ${String(e)}`)
    return NextResponse.json({ error: 'server error' }, { status: 503 })
  }

  try {
    const expiresIn = msUntilToday23JST()
    const sessionCookie = await adminAuth.createSessionCookie(parsed.data.idToken, { expiresIn }) // ログイン状態を維持するためのセッションCookieを作る

    logger.info('ログイン成功')

    const response = NextResponse.json({ success: true })
    response.cookies.set('session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: Math.floor(expiresIn / 1000),
    })
    return response
  } catch (e) {
    // createSessionCookie は FirebaseError を throw する（InfraError ではない）
    logger.error('ログイン Session Cookie 作成失敗', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] Session Cookie 作成失敗: ${String(e)}`)
    return NextResponse.json({ error: 'server error' }, { status: 503 })
  }
}
