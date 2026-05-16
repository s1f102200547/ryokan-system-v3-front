# Ryokan System V3　(Must read this MD first)

## Project 概要
小規模旅館（7部屋）の業務効率化webアプリ。

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- MUI (`@mui/material` + Emotion)
- Firebase Auth + Firestore (`firebase`, `firebase-admin`)
- Cloud Run + Docker でデプロイ（未構成）
- Zod for validation
- Playwright for E2E
- Vitest for unit test

## 実装方針

 機能ごとに E2E → domainの unit test -> domain → infra → application → hooks → integration test -> UI の順で縦断実装

## Commands

```bash
npm run dev       # Dev server (localhost:3000)
npm run build     # Production build
npm run lint      # ESLint
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


## domain層の重要な役割

- 問題：部屋の状態判定は複雑で非直感的。
- 解決策：domain内で部屋の状態判定ビジネスロジックを定義。
- 結果：カプセル化して共通関数・変数として再利用性が高まる。

## hooks層の注意事項
- React 19 で新しく強化されたルールで、useEffect の中で setState を直接呼ぶのはアンチパターン

## エラー処理(詳しくはdocs/ErrorHandling.mdを参照)
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


## Docs（必要に応じて参照）

- `docs/Schema/*.md` - DBスキーマ定義（Daily.md, Reservations.md）
- `docs/Architecture.md` - レイヤー構造・設計パターン・ファイル構造(要確認)
- `docs/Auth.md` - 認証・認可・セッション管理の設計
- `docs/CleaningBoard.md` - 清掃ボードのフィーチャー
- `docs/Deploy.md` - Docker / Cloud Run デプロイ手順
- `docs/ErrorHandling.md` - エラーハンドリングの方針(要確認)
- `docs/KnownIssues.md` - 既知の問題・対応不要と判断した脆弱性の記録
- `docs/Review.md` - 実装後のレビュー項目
- `docs/Security.md` - セキュリティヘッダー・CSP・認証境界の設計方針(要確認)
- `docs/Test.md` - E2Eテストにおける認証情報の扱い方針
- `docs/Timetable.md` - タイムテーブルのフィーチャー