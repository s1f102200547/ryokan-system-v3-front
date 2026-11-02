import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildCsp } from '@/lib/csp'
import { isOutsideBusinessHours } from '@/lib/businessHours'

export function proxy(request: NextRequest) {
  // nonce 生成
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const isDev = process.env.NODE_ENV === 'development'
  const csp = buildCsp({
    nonce,
    isDev,
    authEmulatorHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  })

  const { pathname } = request.nextUrl
  const isLoginPage = pathname === '/login'
  const isTimeRestrictedPage = pathname === '/time-restricted'

  // 時間帯制限（本番のみ、6:00–23:00 JST）
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd) {
    const isOutsideHours = isOutsideBusinessHours()

    if (isOutsideHours && !isTimeRestrictedPage) {
      const redirectResponse = NextResponse.redirect(new URL('/time-restricted', request.url))
      redirectResponse.headers.set('Content-Type', 'text/html; charset=utf-8')
      applySecurityHeaders(redirectResponse, nonce, csp)
      return redirectResponse
    }

    if (!isOutsideHours && isTimeRestrictedPage) {
      const redirectResponse = NextResponse.redirect(new URL('/', request.url))
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
  // 値は固定の DENY で、利用者の入力は入らない（Express 向けのルールの誤検知。docs/CICD.md「Semgrep」）
  // nosemgrep: javascript.express.security.x-frame-options-misconfiguration.x-frame-options-misconfiguration
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
