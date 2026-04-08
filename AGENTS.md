# Ryokan System V3 - Frontend

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

## validation戦略
- infraと外部の間のデータのやり取りでzodを使う
- Next.jsプロジェクト内でfrontendとapi間のデータのやり取りでzodを使う

## Rules

- コミットメッセージは日本語
- コンポーネントは named export を使う
- `any` 型を使わない。必要なら `unknown` + type guard
- Import alias: `@/*` → `./src/*`


## domain層の重要な役割

- 問題：部屋の状態判定は複雑で非直感的。
- 解決策：domain内で部屋の状態判定ビジネスロジックを定義。
- 結果：カプセル化して共通関数・変数として再利用性が高まる。


## Docs（必要に応じて参照）

- `docs/Architecture.md` - レイヤー構造・設計パターン・ファイル構造
- `docs/Auth.md` - 認証・認可・セッション管理の設計
- `docs/Security.md` - セキュリティヘッダー・CSP・認証境界の設計方針
- `docs/Deploy.md` - Docker / Cloud Run デプロイ手順
- `docs/KnownIssues.md` - 既知の問題・対応不要と判断した脆弱性の記録
- `docs/Test.md` - E2Eテストにおける認証情報の扱い方針
- `docs/CleaningBoard.md` - 清掃ボードのフィーチャー
- `docs/Schema/` - DBスキーマ定義（Daily.md, Reservations.md）
- `docs/ErrorHandling.md` - エラーハンドリングの方針


## Reference (必要に応じて参照)
- `v2/*` - 以前のバージョンで使用していたコードの一部