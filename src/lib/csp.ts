import { RECAPTCHA_CONNECT_SOURCES, RECAPTCHA_FRAME_SOURCES } from '@/constants/auth'

type CspOptions = {
  nonce: string
  isDev: boolean
  // ログイン画面だけ: reCAPTCHA Enterprise の iframe と通信を許す（SMS の送信に Identity Platform が求める）。
  // script は 'strict-dynamic' により、nonce の付いたこちらの script が足した enterprise.js とその先の script も動く
  recaptcha?: boolean
}

// self: 自分のドメインのみ許可
export function buildCsp({ nonce, isDev, recaptcha = false }: CspOptions): string {
  return [
    `default-src 'self'`,
    // Reactは開発モードでeval()を使用する（コールスタック再構築等のデバッグ機能）
    // 本番では不要なため、開発環境のみ 'unsafe-eval' を許可する
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`, //「'nonce-${nonce}' 'strict-dynamic'」 -> nonceあったらok
    `style-src 'self' 'unsafe-inline'`,           // MUI使用するのでinlineCSSを許可
    `img-src 'self'`,
    `font-src 'self'`,  // next/font/google はビルド時に自己ホスト化されるので 'self' のみで十分
    // ブラウザは自分の API だけを呼ぶ（パスワードの確認もサーバーが Firebase に送る）。ログイン画面だけ reCAPTCHA も
    `connect-src 'self'${recaptcha ? ` ${RECAPTCHA_CONNECT_SOURCES.join(' ')}` : ''}`,
    ...(recaptcha ? [`frame-src ${RECAPTCHA_FRAME_SOURCES.join(' ')}`] : []),
    `frame-ancestors 'none'`, // iframeとして埋め込まれない
    `base-uri 'self'`,        // baseタグは自分のドメインのみ、悪意あるドメインが設定されないようにする
    `form-action 'self'`,     // formの送信先制限
  ].join('; ')
}
