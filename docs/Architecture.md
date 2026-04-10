# アーキテクチャ

## デザインパターン

採用する設計パターン（4つ）
1. Layered Architecture
2. Repository Pattern
3. Strategy Pattern
4. Command Pattern（状態変更） / UseCase（読み取り）

```
----
UI層（app/, components/, hooks/）
  ↓ 呼び出す
Application層（application/）
  ↓ 呼び出す
Domain層（domain/）or Infra層（infra/）
----
Shared (lib/, types/)
----
```


## 層ごとのルール

| 層 | import してよいもの | import してはいけないもの |
|---|---|---|
| domain/ | 純粋 TS のみ | React, Next.js, Firebase, infra/ |
| application/ | domain/, infra/ | React, Next.js |
| infra/ | domain/ports/, 外部ライブラリ | application/, components/ |
| components/ | hooks/, types/ | application/, domain/, infra/ |
| hooks/ | application/ | domain/, infra/ を直接呼ばない |

## ファイル構造

```
src/
├── proxy.ts        # Next.js Middleware の実装本体（CSPヘッダー付与・セッション Cookie 有無チェック）
│                   # ※ Next.js 16 で middleware.ts に代わる公式ファイル規約（middleware.ts は deprecated）
├── app/            # UI層: App Router, Route Handlers
│   ├── api/auth/   # 認証エンドポイント（サーバーサイド）
│   └── api/        # その他 Route Handlers
├── components/     # UI層: 表示と操作の伝達のみ
├── hooks/          # UI層: Application層の薄いラッパー（Domain層を直接呼ばない）
├── application/    # Application層: Command（状態変更操作）, UseCase（読み取り系オーケストレーション）
├── domain/         # Domain層: 純粋TS、ビジネスルール
│   ├── ports/      # インターフェース定義（Repository等）
│   └── tax/        # Strategy Pattern（税計算等）
├── infra/          # Infra層: ports/ の実装（Firestore, Slack等）
├── lib/            # ユーティリティ
└── types/          # 共通型定義

```