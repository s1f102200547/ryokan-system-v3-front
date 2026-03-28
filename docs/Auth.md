# 認証・認可設計

## 認証フロー

```
ブラウザ → POST /api/auth/login (email, password)
         → Route Handler: signInWithEmailAndPassword
         → 成功: httpOnly Cookie 発行 (session token)
         → 失敗: 429 / 401 レスポンス
```

Cookie 設定: `httpOnly: true, secure: true, sameSite: 'strict'`

## middleware.ts のチェック順序

1. セッション Cookie 検証（なければ /login にリダイレクト）
2. 地域制限: 日本国外からのアクセスをブロック（本番のみ）。`X-Forwarded-For` から IP を取得し MaxMind GeoLite2 で国判定する自前実装
3. 時間帯制限: 6:00-23:00 JST 以外をブロック（本番のみ）
4. レート制限: IP あたりのリクエスト数制限(不正アクセス防止)

## セッション管理

セッションは Firestore に保存する。Cookie にはセッション ID のみを持ち、トークン本体はサーバー側で管理する。

- アイドルタイムアウト: 30分（最後の操作から30分間無操作で自動ログアウト）
- 絶対タイムアウト: 12時間（ログインから12時間経過で強制ログアウト）
- 同時セッション: 1アカウント1セッション（新規ログイン時に旧セッションを Firestore から削除して強制失効）

## ログイン保護

- ログイン失敗5回でアカウントロック
- ロック時に Slack `#ryokan-alerts` へ通知


## レート制限

Cloud Run インスタンスを max 1 に固定するため、状態の分散が起きない。Firestore・Redis 不要でインメモリ Map で完結する。

```ts
// middleware 内で保持
Map<string, { count: number; resetAt: number }>
```

| 対象 | キー | 上限 | ウィンドウ |
|---|---|---|---|
| ログイン API (`/api/auth/login`) | IP アドレス | 10 回 | 1 分 |
| 一般 API | セッション ID | 60 回 | 1 分 |

上限超過時は 429 を返す。

## auth-core の分離構造

認証ロジックはフレームワーク非依存の純粋 TS パッケージとして分離:

```
domain/auth/
├── loginPolicy.ts        # ログイン可否判定（時間帯、地域、レート）
├── sessionPolicy.ts      # セッション有効性判定
├── rateLimiter.ts        # レート制限ロジック
└── ports/
    ├── authProvider.ts    # authenticate(email, password)
    ├── sessionStore.ts    # create(), get(), revoke()
    ├── auditLogger.ts     # record(event)
    └── notifier.ts        # notify(message)
```

`infra/auth/` で Firestore / Cookie / Slack 等の具体実装を提供。
