import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false, //＝「このサーバーはNext.jsで動いてます」という情報を外部に出さない
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
