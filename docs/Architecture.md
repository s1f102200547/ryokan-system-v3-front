# アーキテクチャ

## デザインパターン

採用する設計パターン（5つ）
1. Layered Architecture
2. Repository Pattern
3. Strategy Pattern
4. Command Pattern
5. Observer Pattern

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


## ファイル構造(変更可能性あり)

```
src/
├── app/            # UI層: App Router, Route Handlers
│   ├── api/auth/   # 認証エンドポイント（サーバーサイド）
│   └── api/        # その他 Route Handlers
├── components/     # UI層: 表示と操作の伝達のみ
├── hooks/          # UI層: Application層の薄いラッパー（Domain層を直接呼ばない）
├── application/    # Application層: Command, UseCase
├── domain/         # Domain層: 純粋TS、ビジネスルール
│   ├── ports/      # インターフェース定義（Repository等）
│   └── tax/        # Strategy Pattern（税計算等）
├── infra/          # Infra層: ports/ の実装（Firestore, Slack等）
├── lib/            # ユーティリティ
└── types/          # 共通型定義

```