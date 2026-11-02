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
| `secret-scan` | gitleaks（v8.30.1、チェックサムを確かめてダウンロード）で全履歴の秘密情報を検査する。誤検知は `.gitleaksignore` に Fingerprint で除外する（T8-1） | なし |
| `unit-test` | `npm run test`、`npm run test:tz`（`tests/time/` を3つの TZ で実行） | lint/typecheck/audit/secret-scan |
| `emulator-test` | Java 21・firebase-tools 15.34.1（グローバル）を入れて `npm run test:emulator`（Firestore / Auth Emulator への往復検査とファジング。`tests/emulator/`） | unit-test |
| `e2e` | Chromium install 後に `npm run e2e` | unit-test |
| `zap-scan` | build/start し、`curl` でサーバーの起動を待ってから ZAP Baseline Scan（Dependabot の PR では Issue に書かない） | unit-test |

権限（`permissions`）は、ワークフロー全体を `contents: read` にし、`zap-scan` のジョブにだけ `issues: write` を付ける（T6-7）。`permissions` を書くと、書かなかった権限は `none` になる。非公開リポジトリでは `contents: read` がないと `actions/checkout` が「Repository not found」で失敗する。

action とツールのバージョンは固定する（T6-6）。

- action はコミットの SHA で指定し、行末にバージョンをコメントで書く（例: `actions/checkout@<SHA> # v4.4.0`）。タグは付け替えられるが、SHA は変えられない。
- CI でインストールするツールも正確なバージョンを書く（`firebase-tools@15.34.1`）。公開から7日以上たったバージョンを選ぶ。
- サーバーの起動待ちは、`npx wait-on` ではなく `curl` のループで行う（`npx` は実行のたびに最新版を取得するため）。
- 更新するときは、新しいバージョンのタグが指すコミットの SHA を調べて書き換える。

### 依存のインストール

Node.js は 24 LTS（2028-04-30 までサポート）で、npm は Node に付属のもの（11 系）を使う。CI の `node-version`、`Dockerfile` のベースイメージ、`@types/node` を揃える（T6-4）。

`.npmrc` の設定（T6-5）:

| 設定 | 意味 |
|---|---|
| `min-release-age=7` | 公開から7日たっていない版を入れない（`npm install` で新しく解決するとき）。乗っ取られた版は数日で見つかって取り下げられることが多い |
| `strict-allow-scripts=true` | 依存の install スクリプト（`postinstall` など）は、`package.json` の `allowScripts` に書いたものだけを扱う。書いていないパッケージに install スクリプトがあると `npm ci` が `ESTRICTALLOWSCRIPTS` で失敗する |

`allowScripts` には、今ある install スクリプトをすべて `false`（動かさない）で書いている。`@firebase/util`（App Hosting 用の設定の埋め込み）、`protobufjs`（バージョンの確認）、`esbuild`・`unrs-resolver`（OS 用のバイナリの確認。バイナリは別のパッケージで入る）、`fsevents`（Mac 専用）で、どれも動かさなくてもアプリとテストは動く。

依存を追加・更新して `ESTRICTALLOWSCRIPTS` が出たら、そのパッケージの install スクリプトの中身を読み、要らなければ `npm install-scripts deny <pkg>`、必要なら `npm install-scripts approve <pkg>`（版を固定して許可する）を実行し、`package.json` の変更をコミットする。

`npm install -g`（CI の `firebase-tools`）はプロジェクトの `.npmrc` と `allowScripts` を読まない。

### Dependabot

`.github/dependabot.yml` で、`npm`・`github-actions`・`docker` の通常の更新を行う（T6-3）。

| 項目 | 設定 |
|---|---|
| 頻度 | 週1回（月曜 9:00 JST） |
| 待つ日数 | 公開から7日（`cooldown`。`.npmrc` の `min-release-age=7` と揃える） |
| PR の宛先 | `development` |
| まとめ方 | npm の minor・patch は1つの PR。npm の major は1つずつ。GitHub Actions は全部で1つの PR（SHA と行末のバージョンのコメントを書き換える） |
| 上げないもの | Node の major（`node` のイメージ、`@types/node`）。Node を上げるときに手で揃える |

セキュリティ更新の自動 PR（Dependabot security updates）は使わない。`main` 宛てにしか作れず、マージすると `main` と `development` がずれるため。警告（Dependabot alerts）だけを受け取り、`development` で直す。悪用が報告された脆弱性は7日を待たず、`npm install <pkg>@<修正版> --min-release-age=0` で上げて数日以内にデプロイする。

Dependabot が PR を作ると、Slack の GitHub アプリが `#notif-git` に通知する（ワークフローは使わない）。購読は `/github subscribe s1f102200547/ryokan-system-v3-front pulls +label:"dependencies"` で、Dependabot が PR に付ける `dependencies` ラベルの PR だけを通知する。購読の確認は `/github subscribe list features`。GitHub アプリが読めるリポジトリは、このリポジトリだけにする（GitHub → Settings → Applications → Installed GitHub Apps → Slack）。

Dependabot の PR で動く CI は `GITHUB_TOKEN` が読み取り専用になるので、ZAP の結果を Issue に書かない（`allow_issue_writing`）。

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

`deploy.yml` は `workflow_run` で `CI` workflow の完了を監視し、対象 branch が `main`、conclusion が `success`、かつ CI が `push` で動いた場合のみ実行される（PR の CI では動かない。T6-8）。

Deploy job の流れ:

1. `actions/checkout` で **CI が検査したコミット**（`github.event.workflow_run.head_sha`）を取得する。`workflow_run` の `github.sha` は deploy が始まった時点の `main` の最新で、CI のあとに push されたコミットを指すことがあるため使わない
2. Workload Identity Federation で GCP 認証
3. Artifact Registry 用に Docker 認証を設定
4. Buildx をセットアップ
5. Docker image を build/push。auth が作る `gha-creds-*.json` は `.dockerignore` で build に入れない（T6-10）
6. Cloud Run へ deploy。実行用の SA は `ryokan-runtime`（Firestore と Session Cookie の発行・確認だけ。`GCP_SETUP.md` §5、T6-1）

デプロイの開始と結果（成功・失敗）は、Slack の GitHub アプリ（`#notif-git`）の `workflows` の購読（`/github subscribe s1f102200547/ryokan-system-v3-front workflows:{name:"Deploy to Cloud Run"}`）で Slack に通知する（T5-9）。`deploy.yml` の中では通知しない（`deploy.yml` を書き換えられても、通知は GitHub 側から届く）。CI が `main` で失敗したときも、デプロイのジョブがスキップされたことが通知される

Docker image tag:

```text
asia-northeast1-docker.pkg.dev/${GCP_PROJECT_ID}/ryokan/ryokan-system:${head_sha}
```

Cloud Run settings:

| 項目 | 値 |
|---|---|
| region | `asia-northeast1` |
| service | `ryokan-system` |
| repository | `ryokan` |
| port | `8080` |
| service account | `ryokan-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com`（`deploy.yml` の `RUNTIME_SA_NAME`） |
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
| `SLACK_WEBHOOK_URL` | Cloud Run runtime の障害通知用 webhook（`deploy.yml` が Cloud Run の環境変数に渡す） |

Firebase Admin は Cloud Run の Application Default Credentials を使うため、service account key file は使わない。

## Docker

`Dockerfile` は 3 stage 構成。ベースイメージは3つとも `node:24-alpine` を digest（`@sha256:...`）で固定する（T6-6）。

| Stage | 役割 |
|---|---|
| `deps` | `package.json`・`package-lock.json`・`.npmrc` をコピーして `npm ci` |
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
- CI 失敗時の Slack 通知（deploy の通知は Slack の GitHub アプリで行う）
- 週次の OWASP ZAP Full Scan

これらを追加する場合は、workflow とこのドキュメントを同じ PR で更新する。

## Branch Protection

推奨ルール:

- `main` への直接 push 禁止
- PR 経由のみ
- CI の required checks を必須化
- deploy は `main` の CI 成功後のみ実行
