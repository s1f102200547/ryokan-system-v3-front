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

## Rules

- コミットメッセージは日本語
- コンポーネントは named export を使う
- `any` 型を使わない。必要なら `unknown` + type guard
- Import alias: `@/*` → `./src/*`


## 部屋状態のカプセル化方針

部屋の状態判定（「今夜も滞在継続か」「前日空室か」など）は条件式が複雑で複数機能にまたがる。  
`docs/domain/RoomStateDomain.md` にすべての状態を `{変数名（自然言語）}` の形で定義し、  
`src/domain/room/` に共通関数・変数としてカプセル化する。  
各機能（CleaningBoard / Atax / Timetable など）は **内部条件を見ずに変数名の組み合わせだけでロジックを記述する**。

## Docs（必要に応じて参照）

- `docs/Architecture.md` - レイヤー構造・設計パターン・ファイル構造
- `docs/Auth.md` - 認証・認可・セッション管理の設計
- `docs/Deploy.md` - Docker / Cloud Run デプロイ手順
- `docs/KnownIssues.md` - 既知の問題・対応不要と判断した脆弱性の記録
- `docs/domain/RoomStateDomain.md` - 部屋状態の共通変数定義（全機能共通）← Domain層
- `docs/features/CleaningBoard.md` - 清掃ボードのフィーチャー仕様（表示ロジック・列定義）← Application/UI層
