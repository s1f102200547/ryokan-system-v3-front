import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'
import { buildLoginRejectedNotice, forwardedIps, type LoginRejection } from '@/lib/auth/loginNotice'
import { describeUserAgent } from '@/lib/auth/userAgent'
import { checkClient } from '@/lib/auth/clientCheck'
import { hasPhoneSecondFactor } from '@/lib/auth/secondFactor'
import { clearMfaPendingCookie, issueSession, verifyLoginIdToken } from '@/lib/auth/loginSession'
import { isOutsideBusinessHours } from '@/lib/businessHours'
import { MfaVerifyBodySchema } from '@/lib/api/loginSchema'
import { handleRouteError, parseCookieValue } from '@/lib/api/routeHelpers'
import { verifyMfaCodeCommand } from '@/application/auth/verifyMfaCodeCommand'
import { MFA_PENDING_COOKIE } from '@/constants/auth'

// ログインの2段目: SMS のコードを確かめ、Session Cookie を発行する。
// ログイン前の API なので requireSession は使わない。代わりに、1段目で発行した途中の状態の Cookie（mfa_pending）を求める。
// 順番: 時間帯 → コードの形 → 途中の状態（期限・接続元）→ 失敗回数 → コード → 2要素目を通ったトークンか → A → B → Cookie
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && isOutsideBusinessHours()) {
    logger.warn('ログイン拒否: 時間外')
    return NextResponse.json({ error: 'outside_business_hours' }, { status: 403 })
  }

  const parsed = MfaVerifyBodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  // 途中の状態がなければ、パスワードからやり直す（期限切れ・別のブラウザ）
  const pendingId = parseCookieValue(request.headers.get('cookie'), MFA_PENDING_COOKIE)
  if (!pendingId) return mfaExpired()

  const forwardedFor = request.headers.get('x-forwarded-for')
  const userAgent = request.headers.get('user-agent')
  const ip = forwardedIps(forwardedFor).at(-1) ?? null

  let verified: { idToken: string; email: string }
  try {
    const result = await verifyMfaCodeCommand({ pendingId, code: parsed.data.code, ip, nowMs: Date.now() })
    if (!result.success) {
      switch (result.error.kind) {
        case 'invalid_code':
          return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
        case 'expired':
          return mfaExpired()
        case 'ip_mismatch':
          // Cookie が別の回線で使われた（盗まれた Cookie か、Wi-Fi の切り替え）。利用者には期限切れと同じに見せる
          notifyRejected('ip_mismatch', null, forwardedFor, userAgent)
          return mfaExpired()
        default: {
          const retryAfterSeconds = Math.ceil(result.error.retryAfterMs / 1000)
          return NextResponse.json(
            { error: result.error.kind === 'rate_limited' ? 'too_many_attempts' : 'attempt_in_progress', retryAfterSeconds },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
          )
        }
      }
    }
    verified = result.value
  } catch (e) {
    return handleRouteError(e, 'ログイン（SMS のコード）')
  }

  const decoded = await verifyLoginIdToken(verified.idToken)
  if (!decoded.success) return decoded.error

  // 2要素目を通ったトークンだけ。ここは Firebase の応答を信じない最後の確認（docs/NormalOperationPlan.md の C の 5）
  if (!hasPhoneSecondFactor(decoded.value)) {
    notifyRejected('no_second_factor', decoded.value.email ?? verified.email, forwardedFor, userAgent)
    return clearMfaPendingCookie(NextResponse.json({ error: 'no_second_factor' }, { status: 403 }))
  }

  // 1段目と同じ確認をもう一度（1段目の後に別のブラウザでコードだけを送られても通さない）
  const client = checkClient(userAgent)
  if (!client.success) {
    notifyRejected(client.error, decoded.value.email ?? verified.email, forwardedFor, userAgent)
    return clearMfaPendingCookie(NextResponse.json({ error: 'client_not_allowed' }, { status: 403 }))
  }

  return issueSession({ idToken: verified.idToken, decoded: decoded.value, forwardedFor, userAgent })
}

function mfaExpired(): NextResponse {
  return clearMfaPendingCookie(NextResponse.json({ error: 'mfa_expired' }, { status: 401 }))
}

// account が null: 途中の状態を信じられない（接続元が違う）ので、アカウントは載せない
function notifyRejected(reason: LoginRejection, account: string | null, forwardedFor: string | null, userAgent: string | null) {
  const label = account ?? '（不明）'
  logger.warn('ログイン拒否', { account: label, reason, forwardedIps: forwardedIps(forwardedFor), client: describeUserAgent(userAgent) })
  notifySlackFireAndForget(buildLoginRejectedNotice({ account: label, forwardedFor, userAgent, nowMs: Date.now(), reason }))
}
