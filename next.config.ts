import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false, //＝「このサーバーはNext.jsで動いてます」という情報を外部に出さない
};

export default nextConfig;
