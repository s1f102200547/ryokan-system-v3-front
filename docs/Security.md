## 概要
- XSS・MINEスニッフィング・クリックジャッキング・情報漏洩などを防ぐためのセキュリティ方針

## `src/proxy.ts`
- 適切なセキュリティヘッダーを指定
- nonceベースCSPを実装（リクエストごとにランダムな nonce を生成し、`x-nonce` ヘッダーで `layout.tsx` に渡す）
- 開発環境のみ `script-src` に `'unsafe-eval'` を追加（React の開発モードが `eval()` を使用するため）

## `next.config.ts`
- `poweredByHeader: false` を追加（`X-Powered-By: Next.js` の露出を防止）

## `src/app/layout.tsx`
- nonce を読み取り
- `AppRouterCacheProvider` に `options={{ nonce }}` を渡すことで MUI が生成する `<style>` タグにも nonce を付与

## 設計上の注意点

- **Middleware はセキュリティ境界ではない。ただのUXナビゲーション。**: 認証・認可は各 ServerComponent/RouteHandler, Domain層/Repository で実施する（CVSS 9.1 の CVE 対応済みの教訓）
- **COEP `require-corp`**: `next/font/google` はビルド時にフォントを自己ホスト化するため、実行時に外部リソースへのアクセスが発生せず `require-corp` を適用できる

## 修正不要
- CSP style-src unsafe-inline [10055]
MUIがstyleタグを挿入するため、unsafe-inlineを完全に除去するとUIが壊れます。代わりにnonceを使用してるので問題なし。

- Modern Web Application [10109]
これはSPA/SSRアプリケーションであることをZAPが検出しただけの情報レベルの警告です。アプリ側に問題はない。

- Non-Storable Content
これも対応不要