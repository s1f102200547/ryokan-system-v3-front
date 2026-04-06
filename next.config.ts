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
        ],
      },
    ]
  },
};

export default nextConfig;
