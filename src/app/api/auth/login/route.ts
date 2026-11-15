import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { buildLoginRejectedNotice, forwardedIps, type LoginRejection } from '@/lib/auth/loginNotice'
import { describeUserAgent } from '@/lib/auth/userAgent'
import { checkClient } from '@/lib/auth/clientCheck'
import { issueSession, setMfaPendingCookie, verifyLoginIdToken } from '@/lib/auth/loginSession'
import { currentMfaMode } from '@/lib/auth/mfaMode'
import { isOutsideBusinessHours } from '@/lib/businessHours'
import { LoginBodySchema } from '@/lib/api/loginSchema'
import { handleRouteError } from '@/lib/api/routeHelpers'
import { loginWithPasswordCommand } from '@/application/auth/loginWithPasswordCommand'
import { startMfaCommand } from '@/application/auth/startMfaCommand'

// ログインの1段目: パスワードを確かめ、登録済みの電話に SMS のコードを送る。Session Cookie は2段目（./verify）で発行する。
// 順番: 時間帯 → 長さ → 失敗回数 → パスワード → 端末・ブラウザ（A）→ 2要素目の登録 → SMS の通数 → SMS の送信。
// MFA_MODE=enrolled_only のときだけ、電話を登録していないアカウントは「2要素目の登録」のところで Session Cookie を出して終わる
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

  const forwardedFor = request.headers.get('x-forwarded-for')
  const userAgent = request.headers.get('user-agent')
  const ip = forwardedIps(forwardedFor).at(-1) ?? null // 右端が Google の書いた接続元
  const account = parsed.data.email
  // detail: 理由の補足（Firebase のエラーコード）。ブラウザには返さない
  const reject = (reason: LoginRejection, error: string, detail?: string, status = 403) => {
    logger.warn('ログイン拒否', { account, reason, detail, forwardedIps: forwardedIps(forwardedFor), client: describeUserAgent(userAgent) })
    notifySlackFireAndForget(buildLoginRejectedNotice({ account, forwardedFor, userAgent, nowMs: Date.now(), reason, detail }))
    return NextResponse.json({ error }, { status })
  }

  try {
    // パスワードの確認。失敗が続いたメールアドレス・IP は、しばらく Firebase に送らずに 429
    const passwordOnlyAllowed = currentMfaMode() === 'enrolled_only'
    const result = await loginWithPasswordCommand({ email: account, password: parsed.data.password, ip, nowMs: Date.now(), passwordOnlyAllowed })
    if (!result.success) {
      if (result.error.kind === 'invalid_credentials') return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
      // rate_limited: 失敗が続いて止めている / busy: 同時の試行の結果を待つ（ブラウザが自動で送り直す）
      return tooManyAttempts(result.error.kind === 'rate_limited' ? 'too_many_attempts' : 'attempt_in_progress', result.error.retryAfterMs)
    }

    // 旅館の PC（Windows）の Chrome か Edge だけ。パスワードが合った後に確かめる（誰でも送れるリクエストで [ログイン拒否] を出させない）。
    // パスワードは合っているので、失敗としては数えない。条件に合わない端末には SMS を送らない
    const client = checkClient(userAgent)
    if (!client.success) return reject(client.error, 'client_not_allowed')

    // 2要素目なしで通った = 電話を登録していないアカウント（登録は scripts/mfa/enrollPhone.ts）。
    // MFA_MODE=all なら Cookie は発行しない。enrolled_only（本番で SMS を試す間）なら、パスワードだけでログインを終える
    if (result.value.kind === 'signed_in') {
      if (!passwordOnlyAllowed) return reject('mfa_not_enrolled', 'mfa_not_enrolled')
      return await issuePasswordOnlySession(result.value.idToken, forwardedFor, userAgent, reject)
    }

    const started = await startMfaCommand({
      email: account,
      ip,
      forwardedFor,
      mfaPendingCredential: result.value.mfaPendingCredential,
      mfaEnrollmentId: result.value.mfaEnrollmentId,
      phoneHint: result.value.phoneHint,
      recaptchaToken: parsed.data.recaptchaToken ?? null,
      nowMs: Date.now(),
    })
    if (!started.success) {
      // sms_limit: 今日の上限（明日まで送れない）/ sms_throttled: Firebase 自身が止めた（しばらく待てば送れる）/
      // recaptcha_rejected: パスワードは合っているのに、ブラウザの確認で断られた（読み込み直せば通ることが多い。続けば Slack で気付く）
      if (started.error.kind === 'recaptcha_rejected') {
        const { code, description } = started.error
        return reject('recaptcha_rejected', 'recaptcha_failed', description ? `${code}: ${description}` : code)
      }
      if (started.error.kind === 'sms_limit') return NextResponse.json({ error: 'sms_limit' }, { status: 429 })
      return tooManyAttempts('too_many_attempts', started.error.retryAfterMs)
    }

    logger.info('ログイン: SMS を送った', { account })
    return setMfaPendingCookie(NextResponse.json({ mfaRequired: true, phoneHint: started.value.phoneHint }), started.value.pendingId)
  } catch (e) {
    return handleRouteError(e, 'ログイン')
  }
}

// パスワードだけのログイン（MFA_MODE=enrolled_only の、電話を登録していないアカウント）。ID トークンを確かめてから Cookie を出す。
// 2要素目を通っていないトークンなので、verify の API の「2要素目を通ったトークンか」の確認はしない
async function issuePasswordOnlySession(
  idToken: string,
  forwardedFor: string | null,
  userAgent: string | null,
  reject: (reason: LoginRejection, error: string, detail?: string, status?: number) => NextResponse,
): Promise<NextResponse> {
  const decoded = await verifyLoginIdToken(idToken)
  if (!decoded.success) {
    if (decoded.error.kind === 'unavailable') return NextResponse.json({ error: 'server error' }, { status: 503 })
    // パスワードは合ったのに、トークンが無効（無効化の直後など）。ブラウザには理由を返さない。理由は Firebase のコードで Slack に残す
    return reject('password_only_token_rejected', 'login_failed', decoded.error.code, 401)
  }
  return issueSession({ idToken, decoded: decoded.value, forwardedFor, userAgent, passwordOnly: true })
}

function tooManyAttempts(error: 'too_many_attempts' | 'attempt_in_progress', retryAfterMs: number): NextResponse {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)
  return NextResponse.json({ error, retryAfterSeconds }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
}
