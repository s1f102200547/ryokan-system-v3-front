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
| `audit` | `npm audit --audit-level=high` | なし |
| `unit-test` | `npm run test` | lint/typecheck/audit |
| `e2e` | Chromium install 後に `npm run e2e` | unit-test |
| `zap-scan` | build/start 後に ZAP Baseline Scan | unit-test |

E2E では Firebase SDK の同期的な API key チェックを通すため、CI 上で `NEXT_PUBLIC_FIREBASE_*` にダミー値を渡す。実リクエストは Playwright の route mock で遮断する前提。

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
| auth | `--allow-unauthenticated` |

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

```bash
npm run dev
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
