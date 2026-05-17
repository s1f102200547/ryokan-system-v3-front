# Security Guide

## 概要

XSS、MIME スニッフィング、クリックジャッキング、情報漏洩、セッション不正利用を抑えるための方針をまとめる。

主な実装箇所:

- `src/proxy.ts`: ページレスポンスのセキュリティヘッダー、CSP、時間帯制限、session Cookie 有無チェック。
- `next.config.ts`: `X-Powered-By` 抑止、静的アセット向けヘッダー。
- `src/app/layout.tsx`: MUI style tag へ nonce を渡す。
- `src/app/api/auth/login/route.ts`: Firebase idToken 検証、Session Cookie 発行。
- `src/lib/auth/verifySession.ts`: Route Handler 共通の Session Cookie 検証。

## 認証境界

`proxy.ts` の Cookie 存在確認は UX ナビゲーションであり、セキュリティ境界ではない。保護対象 API は各 Route Handler で `verifySession()` を呼び、Firebase Admin SDK の `verifySessionCookie(cookie, true)` で暗号的に検証する。

例外は `/api/auth/login`。ここでは Firebase Client SDK が取得した `idToken` を受け取り、`adminAuth.verifyIdToken()` で検証してから Session Cookie を発行する。

認証フロー:

1. クライアントが `signInWithEmailAndPassword` で Firebase Auth にログインし、`idToken` を取得する。
2. クライアントが `POST /api/auth/login { idToken }` を呼ぶ。
3. サーバーが `adminAuth.verifyIdToken(idToken)` で改ざん・期限切れ・無効 token を検証する。
4. サーバーが `adminAuth.createSessionCookie(idToken, { expiresIn })` で Session Cookie を発行する。
5. 後続 API は `verifySession(cookie)` で `adminAuth.verifySessionCookie(cookie, true)` を実行し、失敗時は `401` を返す。

Session Cookie の設定:

| 属性 | 値 |
|---|---|
| `httpOnly` | `true` |
| `secure` | production のみ `true` |
| `sameSite` | `strict` |
| `path` | `/` |
| `maxAge` | ログイン当日の 23:00 JST まで |

セッションは Firebase Admin SDK の Session Cookie で管理する。Cookie にはサーバーが発行した不透明なトークンが入り、Firebase が署名・検証する。ログイン時に `Date.now()` から当日 23:00 JST までの残り時間を `expiresIn` として渡し、Firebase の最低値を下回る場合は 5分にフォールバックする。

Firebase Auth の失敗分類:

- パスワード違い、無効 token、期限切れ token、revoke 済み token などは認証失敗として `401`。
- ネットワーク障害、Firebase サービス障害、想定外の SDK エラーは `AUTH_UNAVAILABLE` 相当のインフラ障害として `503`。

## 時間帯制限

本番環境のみ `proxy.ts` で 6:00-23:00 JST の時間帯制限を行う。

- 時間外アクセスは `/time-restricted` へ redirect。
- 時間内に `/time-restricted` へアクセスした場合は `/` へ redirect。
- この制限もセキュリティ境界ではなく、運用上の UX 制御として扱う。

## CSP

`proxy.ts` はリクエストごとに nonce を生成し、`Content-Security-Policy` と `x-nonce` ヘッダーを設定する。

現在の方針:

| directive | 方針 |
|---|---|
| `default-src` | `'self'` |
| `script-src` | `'self'`, nonce, `strict-dynamic`。development のみ `'unsafe-eval'` を許可 |
| `style-src` | `'self'`, `'unsafe-inline'` |
| `img-src` | `'self'` |
| `font-src` | `'self'` |
| `connect-src` | `'self'`, Firebase Auth endpoints |
| `frame-ancestors` | `'none'` |
| `base-uri` | `'self'` |
| `form-action` | `'self'` |

`style-src 'unsafe-inline'` は MUI/Emotion の runtime style 挿入との互換性のため残している。`layout.tsx` では `AppRouterCacheProvider` に nonce を渡し、MUI が生成する style tag にも nonce を付与する。

## セキュリティヘッダー

`proxy.ts` はページレスポンスと redirect レスポンスに以下を付与する。

| Header | 目的 |
|---|---|
| `Content-Security-Policy` | XSS・外部 resource 読み込み制御 |
| `X-Content-Type-Options: nosniff` | MIME スニッフィング防止 |
| `X-Frame-Options: DENY` | clickjacking 防止 |
| `Referrer-Policy: strict-origin-when-cross-origin` | referrer 情報の露出抑制 |
| `Permissions-Policy: camera=(), microphone=(), geolocation=()` | 不要なブラウザ機能を無効化 |
| `Cross-Origin-Opener-Policy: same-origin` | 他 origin からの window 操作抑制 |
| `Cross-Origin-Embedder-Policy: require-corp` | cross-origin resource 埋め込み制限 |
| `Cross-Origin-Resource-Policy: same-origin` | 自 origin resource の外部読み込み抑制 |
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` | HTTPS 強制 |

`COEP: require-corp` は、`next/font/google` が build 時にフォントを自己ホスト化する前提で有効化している。外部画像・外部 script・外部 font を追加する場合は CSP と COEP/CORP の両方を見直す。

## 静的アセット

`/_next/static/*` は `proxy.ts` の matcher 対象外のため、`next.config.ts` の `headers()` で以下を付与する。

- `X-Content-Type-Options: nosniff`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Cache-Control: public, max-age=31536000, immutable`

`/favicon.ico` には `X-Content-Type-Options` と `Cross-Origin-Resource-Policy` を付与する。

`poweredByHeader: false` により `X-Powered-By: Next.js` は外部へ出さない。

## API と入力検証

- API は Route Handler 入口で request body、query、dynamic params を Zod 検証する。
- 認証が必要な API は `verifySession()` を呼ぶ。`proxy.ts` の Cookie 有無チェックだけに依存しない。
- DB 読み取り後のデータ検証失敗は `FIRESTORE_DATA_CORRUPTION` として扱い、ユーザーには内部詳細を出さない。

## ZAP 指摘の扱い

現時点で対応不要と判断しているもの:

| 指摘 | 判断 |
|---|---|
| CSP `style-src 'unsafe-inline'` [10055] | MUI/Emotion との互換性のため残す。nonce も併用する |
| Modern Web Application [10109] | SPA/SSR アプリケーションであることの情報レベル |
| Non-Storable Content | 現状の業務画面では追加対応不要 |

ZAP の新規指摘を KnownIssues に記録する場合は、理由・影響・対応不要と判断した条件を併記する。

## 変更時の注意

- 外部 API、画像 CDN、analytics、iframe を追加する場合は CSP、COEP、CORP を更新する。
- 認証や Cookie を変更する場合はこのファイルの認証境界・Session Cookie 方針も同時に更新する。
- Cloud Run の公開設定や deploy secret を変更する場合は `docs/CICD.md` も確認する。
- セキュリティヘッダーを変更した場合は `npm run build` と ZAP Baseline Scan の結果を確認する。
