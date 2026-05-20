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

## Rules

- コンポーネントは named export を使う
- `any` 型を使わない。必要なら `unknown` + type guard
- Import alias: `@/*` → `./src/*`
- 必要な時に適宜`docs/*`, `docs/Schema/*` を参照
- 定数は`constants/`に書け

## hooks層の注意事項
- React 19 で新しく強化されたルールで、useEffect の中で setState を直接呼ぶのはアンチパターン

## Architecture
- レイヤーは UI(`app/`, `components/`, `hooks/`) → Route Handler(`app/api/`) → Application → Domain + Infra。
- `domain/` と `constants/` は純粋 TS。React、Next.js、Firebase、infra 実装へ依存しない。
- `infra/` は Firestore/Auth など外部 SDK と `domain/ports/` の実装を担当し、UI/Application へ逆依存しない。
- `application/` は UseCase/Command の手順を表現する。読み取りは UseCase、状態変更は Command。
- `components/` は表示とイベント通知、`hooks/` は API 呼び出し・loading/error・日本語メッセージ変換を担当する。
- Route Handler は session 検証、Zod 入力検証、Application/Infra 呼び出し、HTTP response 変換を担当する。

## CI/CD
- CI は `pull_request` to `main` と `push` to `main` で `lint`、`typecheck`、`audit`、`unit-test`、`e2e`、`zap-scan` を実行する。
- Deploy は `main` の CI workflow 成功後に `workflow_run` で Cloud Run へ実行する。
- Docker は `output: 'standalone'` 前提。Cloud Run は `PORT=8080`、Artifact Registry は `asia-northeast1-docker.pkg.dev`。
- `NEXT_PUBLIC_FIREBASE_*` は build arg、`SLACK_WEBHOOK_URL` は Cloud Run runtime env。
- CI/CD 変更時は `.github/workflows/*.yml` と `docs/CICD.md` を同時に更新する。

## Security
- `proxy.ts` の Cookie 存在確認は UX ナビゲーションであり、セキュリティ境界ではない。保護対象 API は各 Route Handler で `verifySession()` を呼ぶ。
- Session Cookie は Firebase Admin SDK で発行・検証し、`httpOnly`, production `secure`, `sameSite: 'strict'`, `path: '/'`。
- セッション期限と本番時間帯制限は当日 23:00 JST に揃える。時間外は `/time-restricted`。
- CSP は nonce ベース。MUI/Emotion 互換のため `style-src 'unsafe-inline'` は残し、MUI style tag には nonce を渡す。
- 外部 API、画像 CDN、analytics、iframe を追加する場合は CSP、COEP、CORP、Security doc を更新する。

## Test
- Unit test は Domain 層を最厚にし、日付・部屋状態・予約状態・配列長・境界値を固定する。
- Integration test は Route Handler の認証、validation、正常系、主要 InfraError、想定外エラーを確認する。
- E2E はログイン、routing、daily dashboard、guest info、a-tax など重要フローに限定する。
- E2E は実 Firebase 認証に依存しない。Playwright route mock と CI の dummy `NEXT_PUBLIC_FIREBASE_*` を使う。
- 実データ・実認証情報をテストへ入れない。

## ErrorHandling
- Domain は例外ではなく Result 型や戻り値で失敗を表現する。
- Infra は Firebase/gRPC/ZodError を `InfraError` に変換して throw する。
- Application は原則 catch せず伝搬する。
- Route Handler は `InfraError` を HTTP status に変換し、ログと必要な Slack 通知を行う。
- Hooks は HTTP status と fetch 失敗をユーザー向け日本語メッセージに変換する。
- `FIRESTORE_UNAVAILABLE` と `AUTH_UNAVAILABLE` は 503、`FIRESTORE_PERMISSION` と `FIRESTORE_DATA_CORRUPTION` は 500、`AUTH_FAILED` は 401。
- `InfraErrorCode` 追加時は `src/lib/infraErrorToHttpStatus.ts` と `docs/ErrorHandling.md` を更新する。

## Context7
- ライブラリ/フレームワークのコード生成、設定、API 仕様、推奨実装、バージョン固有挙動を扱う前に Context7 の公式 docs を確認する。
- 既知 ID は `docs/Context7.md` に集約。Next.js v16、React v19.2、MUI v7、Firebase v12/v13、Zod v4 などは古い知識で補完しない。
- query は具体的にし、1質問あたり最大3回まで。プロジェクト固有の業務ロジックや命名相談では必須ではない。

## Schema
- `dailyInfo/{YYYY-MM-DD}` は日次データ。`todos` は最大50件、`safeBalanceChecker` は宿泊税テーブルの締めスタッフ名。未存在は空値扱い、更新は merge set。
- `guestInfoV2` は予約データ。Firestore 上の日付は `YYYY/MM/DD`、アプリ/API 内部は `YYYY-MM-DD`。
- 予約の部屋は `"21" | "22" | "31" | "32" | "42" | "43" | "61" | null`。空文字は null に正規化する。
- 予約の泊別配列は泊数と同じ長さに正規化し、不正値は fallback で補完する。
- DB 読み取り時の破損は Infra 層で Zod 検証し、必要に応じて `FIRESTORE_DATA_CORRUPTION` とする。
