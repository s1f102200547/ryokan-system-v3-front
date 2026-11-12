import { NextResponse } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { adminAuth } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { isInvalidIdTokenError } from '@/lib/auth/idTokenError'
import { buildLoginNotice, forwardedIps } from '@/lib/auth/loginNotice'
import { describeUserAgent } from '@/lib/auth/userAgent'
import { getTodayJST } from '@/lib/dateUtils'
import { BUSINESS_HOURS_END_JST } from '@/constants/date'
import { MFA_PENDING_COOKIE, MFA_PENDING_COOKIE_PATH, MFA_PENDING_TTL_MS, SESSION_AUTH_TIME_CLAIM } from '@/constants/auth'
import type { Result } from '@/types/result'

// ログインの最後の手順（ID トークンの検証と Session Cookie の発行）と、2要素目の途中の状態の Cookie。
// ログイン API（/api/auth/login）と、SMS のコードの確認 API（/api/auth/login/verify）が使う

// 今日の 23:00 JST までの残り時間（ms）を返す
// ログイン時に Session Cookie の有効期限を当日 23:00 に合わせる（日次サイクル）
function msUntilToday23JST(): number {
  const nowMs = Date.now()
  const nowJST = new Date(nowMs + 9 * 60 * 60 * 1000) // UTC→JST

  // 今日の 23:00 JST（時間帯制限の終了時刻）= 14:00 UTC
  const expire23UTC = Date.UTC(
    nowJST.getUTCFullYear(),
    nowJST.getUTCMonth(),
    nowJST.getUTCDate(),
    BUSINESS_HOURS_END_JST - 9, 0, 0,
  )

  return Math.max(expire23UTC - nowMs, 5 * 60 * 1000) // Firebase の最低値 5分 を保証（5分未満にするとfirebaseがエラーを返すから）
}

// 前のログインの Session Cookie がまだ生きていたか。Cookie は当日 23:00 JST に切れるので、前のログインが今日（JST）なら生きている。
// 22:55 以降のログインは最長 23:05 まで生きるが、時間外はログインできないので扱わない
function isLiveToday(previousAuthTime: unknown): boolean {
  if (typeof previousAuthTime !== 'number') return false
  const jst = new Date(previousAuthTime * 1000 + 9 * 60 * 60 * 1000)
  if (Number.isNaN(jst.getTime())) return false // toISOString が RangeError を投げる値
  return jst.toISOString().slice(0, 10) === getTodayJST()
}

// idToken の整合性検証（改ざん・期限切れ・無効トークンを弾く）。失敗なら返す Response（401 か 503）
export async function verifyLoginIdToken(idToken: string): Promise<Result<DecodedIdToken, NextResponse>> {
  try {
    return { success: true, value: await adminAuth.verifyIdToken(idToken) }
  } catch (e) {
    if (isInvalidIdTokenError(e)) {
      // 認証失敗はビジネスロジックで処理する（インフラ障害ではない）
      logger.warn('ログイン失敗: idToken 検証エラー', { code: (e as { code: string }).code })
      return { success: false, error: NextResponse.json({ error: 'invalid_credentials' }, { status: 401 }) }
    }
    // ネットワーク障害・Firebase サービス障害などはインフラ障害として 503
    logger.error('ログイン idToken 検証 インフラ障害', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] idToken 検証でインフラ障害: ${String(e)}`)
    return { success: false, error: NextResponse.json({ error: 'server error' }, { status: 503 }) }
  }
}

type IssueSessionInput = {
  idToken: string
  decoded: DecodedIdToken
  forwardedFor: string | null
  userAgent: string | null
}

// Session Cookie を発行する（ログインの成功）。途中の状態の Cookie は消す
export async function issueSession({ idToken, decoded, forwardedFor, userAgent }: IssueSessionInput): Promise<NextResponse> {
  const account = decoded.email ?? decoded.uid
  try {
    // 1アカウント1セッション。最後のログインの時刻をクレームに書き、verifySession が Cookie の時刻と比べる（前の Cookie は合わなくなる）。
    // setCustomUserClaims はクレームをまるごと置き換えるので、今のクレームを読んで合わせて書く。書けなければ Cookie を返さない
    const user = await adminAuth.getUser(decoded.uid)
    const previousAuthTime = user.customClaims?.[SESSION_AUTH_TIME_CLAIM]
    await adminAuth.setCustomUserClaims(decoded.uid, { ...user.customClaims, [SESSION_AUTH_TIME_CLAIM]: decoded.auth_time })
    const replacedSession = isLiveToday(previousAuthTime) && previousAuthTime !== decoded.auth_time

    const expiresIn = msUntilToday23JST()
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn }) // ログイン状態を維持するためのセッションCookieを作る

    // 旅館の外からのログインに気付けるよう、毎回 Slack に通知する（ログにも残す。Slack の失敗は気付けないため）
    logger.info('ログイン成功', { account, forwardedIps: forwardedIps(forwardedFor), client: describeUserAgent(userAgent), replacedSession })
    notifySlackFireAndForget(buildLoginNotice({ account, forwardedFor, userAgent, nowMs: Date.now(), replacedSession }))

    const response = NextResponse.json({ success: true })
    response.cookies.set('session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: Math.floor(expiresIn / 1000),
    })
    return clearMfaPendingCookie(response)
  } catch (e) {
    // getUser・setCustomUserClaims・createSessionCookie は FirebaseError を throw する（InfraError ではない）
    logger.error('ログイン Session Cookie 作成失敗', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] Session Cookie 作成失敗: ${String(e)}`)
    return NextResponse.json({ error: 'server error' }, { status: 503 })
  }
}

// 2要素目の途中の状態の ID。ログイン API と verify API にだけ送られる（path）。JavaScript から読めない
export function setMfaPendingCookie(response: NextResponse, pendingId: string): NextResponse {
  response.cookies.set(MFA_PENDING_COOKIE, pendingId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: MFA_PENDING_COOKIE_PATH,
    maxAge: Math.floor(MFA_PENDING_TTL_MS / 1000),
  })
  return response
}

export function clearMfaPendingCookie(response: NextResponse): NextResponse {
  response.cookies.set(MFA_PENDING_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: MFA_PENDING_COOKIE_PATH,
    maxAge: 0,
  })
  return response
}
