import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone', // Cloud Run デプロイ用: node_modules を含む自己完結バンドルを生成 //＝「このサーバーはNext.jsで動いてます」という情報を外部に出さない
  async headers() {
    return [
      {
        // /_next/static/* はproxy.tsのmatcherに到達しないため、こちらで静的アセット用ヘッダーを設定する
        source: '/_next/static/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // ZAP [10049]: 静的アセットは内容が変わらないので長期キャッシュを許可する
          // Next.jsは本番ビルドで自動付与するが、dev環境・リバースプロキシ経由で欠落する場合があるため明示する
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // /api/* は proxy.ts の matcher の対象外（時間帯の制限・Cookie の有無のリダイレクトを API にかけないため）で、
        // ページと同じヘッダーが付かない。API に要るものをここで付ける（e2e/prod/securityHeaders.spec.ts が確かめる）
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },        // JSON を script として読ませない
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }, // 他のサイトに応答を読み込ませない
          { key: 'Cache-Control', value: 'no-store' },                 // 宿泊客の情報を共用の PC のブラウザのキャッシュに残さない
          // JSON は何も読み込まず、埋め込まれる必要もないので、すべて禁止する。
          // frame-ancestors・form-action・base-uri は default-src にフォールバックしないので、個別に書く
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
};

export default nextConfig;
