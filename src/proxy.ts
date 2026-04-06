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
    `connect-src 'self'`,     // 外部通信先制限
    `frame-ancestors 'none'`, // iframeとして埋め込まれない
    `base-uri 'self'`,        // baseタグは自分のドメインのみ、悪意あるドメインが設定されないようにする
    `form-action 'self'`,     // formの送信先制限
  ].join('; ')

  // セッションガード（ログインページは認証不要）
  const isLoginPage = request.nextUrl.pathname === '/login'
  if (!isLoginPage) {
    const session = request.cookies.get('session')
    if (!session) {
      // リダイレクトレスポンスにもセキュリティヘッダーを付与する
      const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
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
