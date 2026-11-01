# CI/CD Guide

## Overview

現状は `main` の CI 成功をトリガーに Cloud Run へ本番デプロイする構成。

- CI: `.github/workflows/ci.yml`
- Deploy: `.github/workflows/deploy.yml`
- Runtime: Cloud Run
- Image registry: Artifact Registry
- Container: `Dockerfile`
- Next.js output: `standalone`

## Standard Flow

1. feature branch で開発する。
2. `main` 向け Pull Request を作成する。
3. PR で CI が実行される。
4. CI が通った PR を `main` に merge する。
5. `main` push でも CI が実行される。
6. `main` の CI が success で完了すると、`deploy.yml` が Docker image を build/push し Cloud Run へ deploy する。

## CI

`ci.yml` は `pull_request` to `main` と `push` to `main` で実行される。

| Job | 内容 | 依存 |
|---|---|---|
| `lint` | `npm run lint` | なし |
| `typecheck` | `npx tsc --noEmit` | なし |
| `audit` | `npm run audit:ci`（high 以上で、例外リストにないものがあれば失敗） | なし |
| `unit-test` | `npm run test`、`npm run test:tz`（`tests/time/` を3つの TZ で実行） | lint/typecheck/audit |
| `emulator-test` | Java 21・firebase-tools 15（グローバル）を入れて `npm run test:emulator`（Firestore / Auth Emulator への往復検査とファジング。`tests/emulator/`） | unit-test |
| `e2e` | Chromium install 後に `npm run e2e` | unit-test |
| `zap-scan` | build/start 後に ZAP Baseline Scan | unit-test |

権限（`permissions`）は、ワークフロー全体を `contents: read` にし、`zap-scan` のジョブにだけ `issues: write` を付ける（T6-7）。`permissions` を書くと、書かなかった権限は `none` になる。非公開リポジトリでは `contents: read` がないと `actions/checkout` が「Repository not found」で失敗する。

E2E の開発サーバーは `playwright.config.ts` の `webServer.env` で、Emulator 系の変数・demo project（`demo-ryokan`）・ダミーの API key を渡して起動する（ローカルと CI で同じ設定。起動ガードを通すため）。Emulator 本体は起動せず、実リクエストは Playwright の route mock で遮断する前提。

### audit の例外リスト

`npm run audit:ci`（`scripts/ci/audit.ts`）は `npm audit --json` を読み、high 以上の advisory を `scripts/ci/auditAllowlist.ts` と突き合わせる。

- 例外は「advisory の GHSA ID」と「脆弱なパッケージ名」の組で指定する。リストにない high / critical が1件でもあれば CI は失敗する。
- 各例外には理由（このアプリで脆弱なコードが実行されない根拠）と期限（最長3か月）を書く。期限を過ぎると CI が再び失敗するので、上流の修正を確認して延長か削除を判断する。
- 報告されなくなった例外は、実行時に「削除してよい」と表示される。
- 例外を追加できるのは、依存の更新や overrides で解消できない場合だけ。`npm audit fix --force` は破壊的なダウングレードを含むので使わない。

現在の例外（2027-01-31 まで）: `@grpc/grpc-js` の GHSA-m9gg-hp2v-232j（high 4件はすべてこの advisory 由来）。ブラウザ用 `firebase` パッケージの `@firebase/firestore` が grpc-js を `~1.9.0` に固定しており、firebase 最新版でも解消しない。ブラウザでは `firebase/firestore` を import しておらず、脆弱性は gRPC サーバー側の問題のため、このアプリでは実行されない。

ZAP Baseline Scan は `http://localhost:3000/login` を対象にし、`fail_action: warn` のため検出だけでは CI を fail させない。

## Deploy

`deploy.yml` は `workflow_run` で `CI` workflow の完了を監視し、対象 branch が `main`、かつ conclusion が `success` の場合のみ実行される。

Deploy job の流れ:

1. `actions/checkout@v4`
2. Workload Identity Federation で GCP 認証
3. Artifact Registry 用に Docker 認証を設定
4. Buildx をセットアップ
5. Docker image を build/push
6. Cloud Run へ deploy

Docker image tag:

```text
asia-northeast1-docker.pkg.dev/${GCP_PROJECT_ID}/ryokan/ryokan-system:${github.sha}
```

Cloud Run settings:

| 項目 | 値 |
|---|---|
| region | `asia-northeast1` |
| service | `ryokan-system` |
| repository | `ryokan` |
| port | `8080` |
| auth | 公開（`allUsers` に `roles/run.invoker`）。サービスに付けた設定のまま。デプロイ用の SA は `roles/run.developer` で、公開の設定を変えられないので、`deploy.yml` は `--allow-unauthenticated` を渡さない |

## Required Secrets

GitHub Actions secrets:

| Secret | 用途 |
|---|---|
| `WORKLOAD_IDENTITY_PROVIDER` | GCP Workload Identity Federation |
| `SERVICE_ACCOUNT` | Deploy に使う GCP service account |
| `GCP_PROJECT_ID` | Artifact Registry / Cloud Run の project id |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | build 時にクライアント bundle へ埋め込む Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | build 時にクライアント bundle へ埋め込む Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | build 時にクライアント bundle へ埋め込む Firebase config |
| `SLACK_WEBHOOK_URL` | Cloud Run runtime の障害通知用 webhook |

Firebase Admin は Cloud Run の Application Default Credentials を使うため、service account key file は使わない。

## Docker

`Dockerfile` は 3 stage 構成。

| Stage | 役割 |
|---|---|
| `deps` | `npm ci` |
| `builder` | `NEXT_PUBLIC_FIREBASE_*` を build arg として受け取り `npm run build` |
| `runner` | `.next/standalone` と `.next/static` をコピーし、非 root user で `node server.js` |

Cloud Run は `PORT` を注入するが、Dockerfile では既定値として `PORT=8080`、`HOSTNAME=0.0.0.0` を設定している。

## Local Environment

ローカル開発は Firebase Emulator にだけ接続する。手順・構成・環境変数は `docs/LocalDevelopment.md` §8 を参照。

```bash
cp .env.development.example .env.development   # 初回のみ。本番の鍵は置かない
make                                           # Emulator 起動 → データ投入 → http://127.0.0.1:3000
```

本番相当の standalone build を確認する場合:

```bash
npm run build
npm run start
```

## 現状未実装

- PR ごとの staging deploy / PR close 時の自動削除
- CI 失敗時・deploy 完了時の GitHub Actions からの Slack 通知
- 週次の OWASP ZAP Full Scan

これらを追加する場合は、workflow とこのドキュメントを同じ PR で更新する。

## Branch Protection

推奨ルール:

- `main` への直接 push 禁止
- PR 経由のみ
- CI の required checks を必須化
- deploy は `main` の CI 成功後のみ実行
