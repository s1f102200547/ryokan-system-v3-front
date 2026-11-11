import { NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { isInvalidIdTokenError } from '@/lib/auth/idTokenError'
import { buildLoginNotice, buildLoginRejectedNotice, forwardedIps } from '@/lib/auth/loginNotice'
import { describeUserAgent } from '@/lib/auth/userAgent'
import { checkClient } from '@/lib/auth/clientCheck'
import { isOutsideBusinessHours } from '@/lib/businessHours'
import { BUSINESS_HOURS_END_JST } from '@/constants/date'
import { SESSION_AUTH_TIME_CLAIM } from '@/constants/auth'
import { LoginBodySchema } from '@/lib/api/loginSchema'
import { handleRouteError } from '@/lib/api/routeHelpers'
import { loginWithPasswordCommand } from '@/application/auth/loginWithPasswordCommand'
import { getTodayJST } from '@/lib/dateUtils'

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

export async function POST(request: Request) {
  // 本番は時間外のログインを断る。画面は proxy.ts で時間外に開けないが、API を直接呼ぶと
  // 深夜でもその日の 23:00 まで有効な Session Cookie が発行されていた
  if (process.env.NODE_ENV === 'production' && isOutsideBusinessHours()) {
    logger.warn('ログイン拒否: 時間外')
    return NextResponse.json({ error: 'outside_business_hours' }, { status: 403 })
  }

  // 不正な JSON や空の body、長すぎる入力は 400（Firebase に送らず、失敗としても数えない）
  const parsed = LoginBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  // パスワードの確認。失敗が続いたメールアドレス・IP は、しばらく Firebase に送らずに 429
  const forwardedFor = request.headers.get('x-forwarded-for')
  const userAgent = request.headers.get('user-agent')
  let idToken: string
  try {
    const result = await loginWithPasswordCommand({
      email: parsed.data.email,
      password: parsed.data.password,
      ip: forwardedIps(forwardedFor).at(-1) ?? null, // 右端が Google の書いた接続元
      nowMs: Date.now(),
    })
    if (!result.success) {
      if (result.error.kind !== 'invalid_credentials') {
        // too_many_attempts: 失敗が続いて止めている / attempt_in_progress: 同時の試行の結果を待つ（ブラウザが自動で送り直す）
        const retryAfterSeconds = Math.ceil(result.error.retryAfterMs / 1000)
        return NextResponse.json(
          { error: result.error.kind === 'rate_limited' ? 'too_many_attempts' : 'attempt_in_progress', retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        )
      }
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    idToken = result.value.idToken
  } catch (e) {
    return handleRouteError(e, 'ログイン')
  }

  // idToken の整合性検証（改ざん・期限切れ・無効トークンを弾く）
  let account: string
  let uid: string
  let authTime: number
  try {
    const decoded = await adminAuth.verifyIdToken(idToken)  // REST で得たトークンから uid・auth_time・email を取る
    account = decoded.email ?? decoded.uid
    uid = decoded.uid
    authTime = decoded.auth_time
  } catch (e) {
    if (isInvalidIdTokenError(e)) {
      // 認証失敗はビジネスロジックで処理する（インフラ障害ではない）
      logger.warn('ログイン失敗: idToken 検証エラー', { code: (e as { code: string }).code })
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    // ネットワーク障害・Firebase サービス障害などはインフラ障害として 503
    logger.error('ログイン idToken 検証 インフラ障害', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] idToken 検証でインフラ障害: ${String(e)}`)
    return NextResponse.json({ error: 'server error' }, { status: 503 })
  }

  // 旅館の PC（Windows）の Chrome か Edge だけ。パスワードが合った後に確かめる（誰でも送れるリクエストで [ログイン拒否] を出させない）。
  // パスワードは合っているので、失敗としては数えない
  const client = checkClient(userAgent)
  if (!client.success) {
    logger.warn('ログイン拒否: 端末・ブラウザ', { account, reason: client.error, forwardedIps: forwardedIps(forwardedFor), client: describeUserAgent(userAgent) })
    notifySlackFireAndForget(buildLoginRejectedNotice({ account, forwardedFor, userAgent, nowMs: Date.now(), reason: client.error }))
    return NextResponse.json({ error: 'client_not_allowed' }, { status: 403 })
  }

  try {
    // 1アカウント1セッション。最後のログインの時刻をクレームに書き、verifySession が Cookie の時刻と比べる（前の Cookie は合わなくなる）。
    // setCustomUserClaims はクレームをまるごと置き換えるので、今のクレームを読んで合わせて書く。書けなければ Cookie を返さない
    const user = await adminAuth.getUser(uid)
    const previousAuthTime = user.customClaims?.[SESSION_AUTH_TIME_CLAIM]
    await adminAuth.setCustomUserClaims(uid, { ...user.customClaims, [SESSION_AUTH_TIME_CLAIM]: authTime })
    const replacedSession = isLiveToday(previousAuthTime) && previousAuthTime !== authTime

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
    return response
  } catch (e) {
    // getUser・setCustomUserClaims・createSessionCookie は FirebaseError を throw する（InfraError ではない）
    logger.error('ログイン Session Cookie 作成失敗', { message: String(e) })
    notifySlackFireAndForget(`[ALERT] Session Cookie 作成失敗: ${String(e)}`)
    return NextResponse.json({ error: 'server error' }, { status: 503 })
  }
}
