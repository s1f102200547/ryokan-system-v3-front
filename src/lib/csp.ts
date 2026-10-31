type CspOptions = {
  nonce: string
  isDev: boolean
  // NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST（例: 127.0.0.1:9099）
  authEmulatorHost: string | undefined
}

// self: 自分のドメインのみ許可
export function buildCsp({ nonce, isDev, authEmulatorHost }: CspOptions): string {
  // Firebase Auth（signInWithEmailAndPassword）が叩く外部エンドポイントを許可
  const connectSrc = [`'self'`, 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com']
  // DEV-5: development のときだけ Auth Emulator を許可する。production の CSP は変えない
  if (isDev && authEmulatorHost) {
    connectSrc.push(`http://${authEmulatorHost}`)
  }

  return [
    `default-src 'self'`,
    // Reactは開発モードでeval()を使用する（コールスタック再構築等のデバッグ機能）
    // 本番では不要なため、開発環境のみ 'unsafe-eval' を許可する
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`, //「'nonce-${nonce}' 'strict-dynamic'」 -> nonceあったらok
    `style-src 'self' 'unsafe-inline'`,           // MUI使用するのでinlineCSSを許可
    `img-src 'self'`,
    `font-src 'self'`,  // next/font/google はビルド時に自己ホスト化されるので 'self' のみで十分
    `connect-src ${connectSrc.join(' ')}`,
    `frame-ancestors 'none'`, // iframeとして埋め込まれない
    `base-uri 'self'`,        // baseタグは自分のドメインのみ、悪意あるドメインが設定されないようにする
    `form-action 'self'`,     // formの送信先制限
  ].join('; ')
}
