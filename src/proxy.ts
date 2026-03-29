import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// すべてのリクエスト(自身のurlへのアクセス)に対する処理の最初に実行される
export function proxy(request: NextRequest) {
  const session = request.cookies.get('session')
  if (!session) { //クッキーにセッションが無かったら(未ログイン状態)
    return NextResponse.redirect(new URL('/login', request.url)) // /login へ強制遷移
  }
  return NextResponse.next()
}

// 以下のパスアクセス時はミドルウェア(認証)を実行しない
export const config = {
  matcher: ['/((?!login|api|_next|favicon.ico).*)'],
}
