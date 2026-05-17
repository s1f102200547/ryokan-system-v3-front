# Ryokan System V3 (Must read this MD first)

## Project 概要
小規模旅館（7部屋）の業務効率化webアプリ。

## 技術スタック

- **Framework**: Next.js 16 (App Router想定)
- **UI Library**: MUI v7 (Material UI + Icons + X Date Pickers v9 + Next.js Integration)
- **Styling**: Emotion (MUIのデフォルト) v11
- **Backend**: Firebase v12 (Firestore, Auth) + firebase-admin v13
- **Language**: TypeScript 5 + React 19.2
- **Validation**: Zod v4
- **Date**: dayjs v1
- **Testing**: Vitest v4 (unit) + Playwright v1 (E2E) + Testing Library
- **Linter**: ESLint v9 (eslint-config-next)
- **Deployment**: GCP Cloud Run (Docker)

> 注意: React 19, Next.js 16, MUI v7, Firebase v12, Zod v4 はいずれも比較的新しいバージョンであり、LLMの学習データに古い情報が含まれている可能性が高い。必ずContext7で最新ドキュメントを参照すること。

## 実装方針

 機能ごとに E2E → domainの unit test -> domain → infra → application → hooks → integration test -> UI の順で縦断実装

## Commands

```bash
npm run dev       # Dev server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint
```

```bash
npm run test      # Vitest（unit / integration）
npm run test:ui   # Vitest UI
npm run e2e       # Playwright E2E
```

## テスト戦略

```
Unit test（Domain層）  ← 「最も多く書く」
Integration test       ← 「Route Handler（API）の"入口->出口"を検証」
E2E test（Playwright） ← 「重要フローのみ」
```

## Rules

- コミットメッセージは日本語
- コンポーネントは named export を使う
- `any` 型を使わない。必要なら `unknown` + type guard
- Import alias: `@/*` → `./src/*`


## constants層の役割

- `src/constants/` にドメイン定数（部屋・予約・ゲスト情報など）を配置する
- domain/ から import 可能。React・Next.js・Firebase に依存しない純粋 TS のみ

## domain層の重要な役割

- 問題：部屋の状態判定は複雑で非直感的。
- 解決策：domain内で部屋の状態判定ビジネスロジックを定義。
- 結果：カプセル化して共通関数・変数として再利用性が高まる。

## hooks層の注意事項
- React 19 で新しく強化されたルールで、useEffect の中で setState を直接呼ぶのはアンチパターン


## エラー処理
- 外部エラーは Infra 層で InfraError に変換し、層を跨ぐごとに抽象化して伝搬する。
- Domain 層は例外を使わず Result 型で失敗を表現する。
- Infra 層は Firebase・gRPC・ZodError を InfraError に変換して throw する。
- Application 層では catch せず、そのままエラーを上位へ流す。
- Route Handler は InfraError を HTTP ステータスへ変換し、ログ出力や Slack 通知を行う。
- Hooks 層は HTTP ステータスをユーザー向け日本語メッセージへ変換する。
- UI 層は受け取った日本語メッセージをそのまま表示する。
- 認証エラーは「認証失敗」と「インフラ障害」を分離し、後者のみ AUTH_UNAVAILABLE として扱う。
- Slack 通知は「人が対応しないと直らない障害」のみ対象で、通知処理は fire-and-forget にする。
- 入出力や DB 読み取り時は Zod で検証し、データ破損時は FIRESTORE_DATA_CORRUPTION として扱う。
- InfraErrorCode は以下を基本とする。

| コード | 主な発生源 | HTTP | Slack通知 |
|---|---|---|---|
| `FIRESTORE_UNAVAILABLE` | gRPC code=14 など Firestore 利用不能 | 503 | する |
| `FIRESTORE_PERMISSION` | gRPC code=7 など Firestore 権限不備 | 500 | する |
| `FIRESTORE_DATA_CORRUPTION` | DB 読み取り後の Zod 検証失敗 | 500 | する |
| `AUTH_UNAVAILABLE` | Firebase Auth のネットワーク障害・内部障害 | 503 | する |
| `AUTH_FAILED` | パスワード違い・無効 token など認証失敗 | 401 | しない |

- InfraErrorCode を追加したら `src/lib/infraErrorToHttpStatus.ts` の switch を必ず更新する。
- 公開ページでは 500/503 の詳細を出し分けず、監視インフラの存在を公開しない。
- 認証済みページでは 503 はリトライを促し、それ以外は管理者通知済みとして案内する。
- fetch 失敗（ネットワーク断）は HTTP エラーとは別のユーザー向けメッセージにする。
- ログレベルは、処理不能なら ERROR、処理は完了したが異常がある場合は WARN、ログイン成功など正常な重要イベントは INFO。
- React Error Boundary の全面導入、深いカスタム例外階層、全 API response の Zod 検証、Sentry 等の外部監視は現時点では導入しない。

## Library Documentation Rule (Context7)

ライブラリやフレームワークに関する以下の質問では、回答前に必ず context7 MCP を使って最新の公式ドキュメントを取得すること：

- コード生成（コンポーネント実装、関数実装、Server Action実装など）
- セットアップ・インストール手順
- 設定方法・configuration
- API仕様、メソッドシグネチャ、プロパティ
- ベストプラクティス、推奨される書き方
- バージョン固有の機能や挙動

### 手順
1. `resolve-library-id` でライブラリIDを解決する（下記の既知IDがあればスキップ）
2. `query-docs`（または `get-library-docs`）で関連ドキュメントを取得する
3. 取得した最新ドキュメントに基づいて回答する
4. 私が "use context7" と明示的に書かなくても、自動的にこのフローを実行すること

### 既知のライブラリID（解決ステップを省略してトークン節約）
本プロジェクトで使用するライブラリのID：

| ライブラリ | Context7 ID | バージョン |
|-----------|------------|----------|
| Next.js | `/vercel/next.js` | v16 |
| React | `/facebook/react` | v19.2 |
| MUI Material UI | `/mui/material-ui` | v7 |
| MUI X (Date Pickers) | `/mui/mui-x` | v9 |
| Material UI Next.js Integration | `/mui/material-ui` | v7 (material-nextjsパッケージ含む) |
| Emotion | `/emotion-js/emotion` | v11 |
| Firebase JS SDK | `/firebase/firebase-js-sdk` | v12 |
| Firebase Admin | `/firebase/firebase-admin-node` | v13 |
| Zod | `/colinhacks/zod` | v4 |
| dayjs | `/iamkun/dayjs` | v1 |
| TypeScript | `/microsoft/typescript` | v5 |
| Vitest | `/vitest-dev/vitest` | v4 |
| Playwright | `/microsoft/playwright` | v1 |
| Testing Library (React) | `/testing-library/react-testing-library` | v16 |
| ESLint | `/eslint/eslint` | v9 |

### トークン節約のためのクエリ作成
- `query` パラメータは具体的に書く
  - 悪い例: `"Button"`, `"auth"`
  - 良い例: `"Button component with loading state in MUI v7"`, `"Firestore real-time listener with TypeScript types"`
- 1質問あたり最大3回までのツール呼び出しに留めること
- 必要なトピックを絞り込んで、関連スニペットのみを取得する

### 適用しない場面
- 自然言語の説明や雑談
- プロジェクト固有のビジネスロジックの設計議論
- 既に取得済みのドキュメントで十分な追加質問
- ファイル構造や命名規則についての質問

## Docs（必要に応じて参照）

- `docs/Schema/*.md` - DBスキーマ定義（Daily.md, Reservations.md）
- `docs/Architecture.md` - レイヤー構造・設計パターン・ファイル構造(要確認)
- `docs/Auth.md` - 認証・認可・セッション管理の設計
- `docs/Deploy.md` - Docker / Cloud Run デプロイ手順
- `docs/KnownIssues.md` - 既知の問題・対応不要と判断した脆弱性の記録
- `docs/Review.md` - 実装後のレビュー項目
- `docs/Security.md` - セキュリティヘッダー・CSP・認証境界の設計方針(要確認)
- `docs/Test.md` - E2Eテストにおける認証情報の扱い方針
