# Ryokan System V3 - Frontend

## Project 概要
小規模旅館（7部屋）の業務効率化webアプリ。

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 5
- MUI for UI components（未導入。導入時は `@mui/material` + Emotion）
- Firebase Auth + Firestore（未導入。導入時は `firebase`, `firebase-admin`）
- Cloud Run + Docker でデプロイ（未構成）
- Zod for validation（未導入）
- Playwright for E2E（未導入）
- Vitest for unit test（未導入）


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

- コンポーネントは named export を使う
- `any` 型を使わない。必要なら `unknown` + type guard
- Import alias: `@/*` → `./src/*`


## Docs（必要に応じて参照）

- `docs/architecture.md` - レイヤー構造とデータフローの詳細
- `docs/auth.md` - 認証・認可・セッション管理の設計
- `docs/deploy.md` - Docker / Cloud Run デプロイ手順
