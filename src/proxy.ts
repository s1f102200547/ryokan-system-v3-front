import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // nonce 生成
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  // Reactは開発モードでeval()を使用する（コールスタック再構築等のデバッグ機能）
  // 本番では不要なため、開発環境のみ 'unsafe-eval' を許可する
  const isDev = process.env.NODE_ENV === 'development'

  // self: 自分のドメインのみ許可
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`, //「'nonce-${nonce}' 'strict-dynamic'」 -> nonceあったらok
    `style-src 'self' 'unsafe-inline'`,           // MUI使用するのでinlineCSSを許可
    `img-src 'self'`,
    `font-src 'self'`,  // next/font/google はビルド時に自己ホスト化されるので 'self' のみで十分
    `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com`, // Firebase Auth（signInWithEmailAndPassword）が叩く外部エンドポイントを許可
    `frame-ancestors 'none'`, // iframeとして埋め込まれない
    `base-uri 'self'`,        // baseタグは自分のドメインのみ、悪意あるドメインが設定されないようにする
    `form-action 'self'`,     // formの送信先制限
  ].join('; ')

  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isTimeRestrictedPage = pathname === '/time-restricted'

  // 時間帯制限（本番のみ、6:00–23:00 JST）
  // /time-restricted は制限対象外（それ以外の全ページをブロック）
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && !isTimeRestrictedPage) {
    // UTC+9 で現在時刻を計算
    const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const minuteOfDay = nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes()
    const isOutsideHours = minuteOfDay < 6 * 60 || minuteOfDay >= 23 * 60  // 6:00未満 or 23:00以降
    if (isOutsideHours) {
      const redirectResponse = NextResponse.redirect(new URL('/time-restricted', request.url))
      redirectResponse.headers.set('Content-Type', 'text/html; charset=utf-8')
      applySecurityHeaders(redirectResponse, nonce, csp)
      return redirectResponse
    }
  }

  // セッションガード（/login・/time-restricted は認証不要）
  if (!isLoginPage && !isTimeRestrictedPage) {
    const session = request.cookies.get('session')
    if (!session) {
      // リダイレクトレスポンスにもセキュリティヘッダーを付与する
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
      // ZAP [10019]: リダイレクトレスポンスでも Content-Type が必要(明示することでMIMEスニッフィング防止)
      redirectResponse.headers.set('Content-Type', 'text/html; charset=utf-8')
      applySecurityHeaders(redirectResponse, nonce, csp)
      return redirectResponse
    }
  }

  const response = NextResponse.next()
  applySecurityHeaders(response, nonce, csp)
  return response
}

function applySecurityHeaders(response: NextResponse, nonce: string, csp: string) {
  const h = response.headers

  // nonce を layout.tsx に渡す
  h.set('x-nonce', nonce)

  // セキュリティヘッダー
  h.set('Content-Security-Policy', csp)
  h.set('X-Content-Type-Options', 'nosniff')  // MIMEスニッフィング禁止
  h.set('X-Frame-Options', 'DENY')
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin') //遷移時に知られるurlにトークンなどが含まれないようにする
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  h.set('Cross-Origin-Opener-Policy', 'same-origin')    // 自分のウィンドウを他のオリジンから操作させない
  h.set('Cross-Origin-Embedder-Policy', 'require-corp')  // 外部リソースはすべて同一オリジンから（next/font は自己ホスト化済み）
  h.set('Cross-Origin-Resource-Policy', 'same-origin')  // 他のサイトから自リソースを読み込ませない
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains') //最後にアクセスしてから(ヘッダーを受け取ってから)1年間はhttps強制
}

export const config = {
  // /login を含める（以前は除外していたため /login にヘッダーが付かなかった）
  // /_next/static/* は next.config.ts の headers() で対応
  matcher: ['/((?!api|_next|favicon.ico).*)'],
}
