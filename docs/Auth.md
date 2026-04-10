# 認証・認可設計

## 認証フロー

```
[クライアント]
  1. signInWithEmailAndPassword (Firebase Client SDK) → idToken 取得
  2. POST /api/auth/login { idToken }

[サーバー: /api/auth/login]
  3. adminAuth.verifyIdToken(idToken)        ← 整合性・改ざん検証
  4. adminAuth.createSessionCookie(idToken, { expiresIn: 当日23:00まで })
  5. Set-Cookie: session=<opaque>; HttpOnly; Secure; SameSite=Strict

[後続リクエスト]
  6. Route Handler → verifySession(cookie)
     → adminAuth.verifySessionCookie(cookie, checkRevoked=true)
     → uid を取得してビジネスロジックへ（失敗は 401）
```

Cookie 設定: `httpOnly: true, secure: true (本番のみ), sameSite: 'strict'`

## セッション管理

セッションは Firebase Admin SDK の Session Cookie で管理する。Cookie にはサーバーが発行した不透明なトークンが入り、Firebase が暗号的に署名・検証する。

- **有効期限**: ログイン当日の 23:00 JST 固定（日次サイクル）
- **期限計算**: ログイン時に `Date.now()` から当日 23:00 UTC+9 までの残り時間を `expiresIn` として `createSessionCookie` に渡す
- **最短保証**: Firebase の最低値（5分）を下回る場合は 5分にフォールバック

期限が切れたセッションは `verifySessionCookie` が `auth/session-cookie-expired` を返し、Route Handler が 401 を返す。

## 時間帯制限

本番環境のみ、`proxy.ts`（Next.js 16 Middleware）で制御する。

- **営業時間**: 6:00〜23:00 JST
- **時間外アクセス**: `/time-restricted` へリダイレクト（`/login` も含む全ページ）
- **セッションとの関係**: セッション有効期限（23:00）と時間帯制限（23:00〜）が一致しているため、時間外にセッションが生きた状態でアクセスしてくることは想定しない

## proxy.ts のチェック順序

1. **時間帯制限**（本番のみ）: 6:00未満・23:00以降 → `/time-restricted` にリダイレクト
2. **セッション Cookie 存在確認**: Cookie がなければ `/login` にリダイレクト（UX ナビゲーション）

> **注意**: proxy.ts はセキュリティ境界ではない。Cookie の暗号的な検証は各 Route Handler で `verifySession()` を呼ぶことで行う。

## ログイン保護

- Firebase Client SDK で認証失敗（`auth/wrong-password`, `auth/invalid-credential` 等）→ クライアント側でエラー表示
- `verifyIdToken` 失敗（改ざん・期限切れ idToken）→ 401
- Firebase インフラ障害 → 503

## 実装ファイル構造

```
src/
├── proxy.ts                            # Middleware: 時間帯制限・Cookie 存在確認・CSP
├── hooks/auth/useLogin.ts              # Client: Firebase 認証 → idToken 取得 → API 呼び出し
├── app/api/auth/login/route.ts         # Route Handler: idToken 検証 → Session Cookie 発行
├── lib/auth/verifySession.ts           # サーバー共通: Session Cookie 検証ヘルパー
└── lib/firebase/admin.ts               # Firebase Admin SDK 初期化（adminAuth, adminDb）
```
