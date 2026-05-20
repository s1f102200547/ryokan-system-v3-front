# アーキテクチャ

## 基本方針

小規模旅館の業務画面を、App Router ベースの UI と Route Handler API、Firestore を使う Infra 層、純粋 TypeScript の Domain 層に分ける。

採用する設計パターン:

1. Layered Architecture
2. Repository Pattern
3. Strategy Pattern
4. Command Pattern（状態変更） / UseCase（読み取り）

```
UI層（app/, components/, hooks/）
  ↓
Route Handler（app/api/）
  ↓
Application層（application/）
  ↓
Domain層（domain/） + Infra層（infra/）

Shared（constants/, lib/, types/）
```

## 層ごとのルール

| 層 | import してよいもの | import してはいけないもの |
|---|---|---|
| constants/ | 純粋 TS のみ | React, Next.js, Firebase, infra/ |
| domain/ | constants/, types/ など純粋 TS | React, Next.js, Firebase, infra/, application/ |
| domain/ports/ | types/ など純粋 TS | infra/ の実装、Firebase |
| infra/ | domain/ports/, constants/, types/, 外部 SDK | application/, hooks/, components/ |
| application/ | domain/, domain/ports/, infra/ | React, UI components |
| app/api/ | application/, infra/, lib/, types/ | components/, hooks/ |
| hooks/ | application/API fetch, types/ | domain/, infra/ を直接呼ばない |
| components/ | hooks/, types/, constants/ | application/, infra/ を直接呼ばない |

## 現在のファイル構造

```
src/
├── proxy.ts        # CSP/セキュリティヘッダー、時間帯制限、session Cookie 有無のページガード
├── app/            # App Router のページと Route Handlers
│   ├── api/        # guest-info, reservations, timetable, cleaning-board, daily, auth
│   ├── daily-dashboard/
│   ├── a_tax_table/
│   ├── login/
│   └── time-restricted/
├── components/     # 画面部品。表示と操作イベントの受け渡しを担当
├── hooks/          # UI 向け状態管理、fetch、ユーザー向けエラーメッセージ変換
├── application/    # UseCase/Command。読み取り集約と状態変更の手順を表現
├── domain/         # 純粋 TS のビジネスルール
│   ├── auth/
│   ├── reservation/
│   ├── room/
│   └── ports/
├── infra/          # Firestore/Auth など外部依存の実装
│   ├── auth/
│   ├── daily/
│   └── reservation/
├── constants/      # 部屋番号、タイムテーブル、ゲスト情報などのドメイン定数
├── lib/            # Route helper, Firebase 初期化, logger, Slack, 日付など
└── types/          # 共通型、Result 型、InfraError 型

tests/
├── unit/           # Domain 層のユニットテスト（src/ に依存しない純粋 TS テスト）
│   └── domain/     # auth/, reservation/, room/ の各ビジネスルールテスト
├── integration/    # Route Handler の統合テスト（verifySession・InfraError・HTTP変換を含む）
│   └── api/        # src/app/api/ と対応するディレクトリ構造
├── mocks/          # vi.mock 用のモック実装（将来的な手動モック置き場）
├── fixtures/       # テストデータ・固定値（将来的な共通 fixture 置き場）
├── utils/          # テストユーティリティ（routeTestHelper 等）
└── setup/          # Vitest グローバルセットアップ（setup.ts）
```

`@tests/*` エイリアス（`vitest.config.ts` / `tsconfig.json`）で `tests/` 配下を絶対 import できる。
`@/*` エイリアスは `src/` を指す。

## Route Handler の責務

- session Cookie を検証し、未認証は `401` を返す。
- request body、query、dynamic params は Route Handler の入口で Zod 検証する。
- Application 層または Infra 層を呼び出し、HTTP レスポンスへ変換する。
- `InfraError` は `handleRouteError` で HTTP ステータスへ変換し、ログと Slack 通知を行う。

## Domain と Infra の境界

- Domain 層は例外で失敗を表現しない。ビジネス上の失敗は `Result` 型や戻り値で表現する。
- Firestore、Firebase Auth、Zod の外部エラーは Infra 層で `InfraError` に変換する。
- DB 読み取り後のデータ検証は Infra 層で行い、破損データは `FIRESTORE_DATA_CORRUPTION` として扱う。

## UI 層の責務

- `components/` は表示とイベント通知に寄せる。
- `hooks/` は API 呼び出し、loading/error 状態、HTTP ステータスから日本語メッセージへの変換を担当する。
- React 19 では `useEffect` 内での直接 `setState` 連鎖を避け、初期値・派生値・イベントハンドラで表現できる状態はそちらへ寄せる。
