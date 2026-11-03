# Development（ローカル開発・テスト・CI/CD）

## ローカル開発

開発中は **Firebase Emulator にだけ接続する**。本番の Firebase・GCP には接続しない。

```bash
cp .env.development.example .env.development   # 初回だけ（中身は Emulator 用の固定値。本番の値は入れない）
make            # Emulator 起動 → データ投入 → next dev。Ctrl+C で全部止まる
```

- 必要なもの: Node（CI・Docker は 24）、Java（Firestore Emulator）、`firebase-tools`（グローバル。依存には入れていない）
- 開発サーバー http://127.0.0.1:3000、Emulator UI http://127.0.0.1:4000、Firestore 8080、Auth 9099。すべて `127.0.0.1` に bind する（`firebase.json`, `package.json` の `dev`）
- ログイン: `dev@example.com` / `dev-password`（Emulator 専用。`scripts/localdev/constants.ts`）
- 投入データ: `.localdev/data/` に匿名化データがあればそれ、なければ `tests/fixtures/localdev/` の人工データ。人工データには本番によくある崩れ（型違い、`""` と `null`、壊れた日付、長さ違いの配列）をわざと入れてある
- Emulator は止めるとデータが消える。`make seed` で入れ直す（全消去してから入れる）
- 別々に起動するとき: `make emulators` と `make dev`（別の端末で `make seed`）

### 起動ガード（`src/lib/firebase/runtimeEnvGuard.ts`）

起動時（`src/instrumentation.ts`）と Admin SDK の初期化時（`src/lib/firebase/admin.ts`）に環境変数を検査し、満たさなければ起動しない。

| `NODE_ENV` | 必須 | 拒否 |
|---|---|---|
| `development` / `test` | `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`（サーバーと同じ値）, `FIREBASE_PROJECT_ID`（`demo-` で始まる）, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`（同じ値） | `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `GOOGLE_APPLICATION_CREDENTIALS`、名前に `PRIVATE_KEY` を含む変数（空でも） |
| それ以外（本番） | — | `*_EMULATOR_HOST`, `FIREBASE_EMULATOR_HUB`、`demo-` の project ID |

本番の Admin SDK は ADC（Cloud Run の実行用サービスアカウント）で認証する。鍵ファイルは使わない。

### 本番データの匿名化（人だけが実行する）

`make anonymize` は閲覧専用のサービスアカウントで本番 Firestore を全件読み、許可リスト（`scripts/localdev/lib/allowlist.ts`）にないフィールドをすべてマスクして `.localdev/data/` に書く（Git・Docker の対象外）。日付・部屋・人数・時刻などの形は残す。終了時に gcloud・ADC・Firebase CLI の認証情報を消す。

**AI エージェントはこのコマンドを実行しない。開発者が実行している間、エージェントは止める。** `.localdev/` の中身も読まない。

## テスト

| 種類 | 場所 | 実行 | 書くこと |
|---|---|---|---|
| Unit | `tests/unit/` | `npm run test` | Domain を最も厚く（日付の境界、部屋の状態、予約の状態、配列の長さ）。infra の `toReservation`、lib、hooks の純粋関数、匿名化の変換 |
| 制約の突き合わせ | `tests/unit/constraints/` | 同上 | UI の選択肢 → Route の Zod → Infra の読み取りで値が消えないこと。上限ちょうどは通り、+1 は拒否 |
| Integration | `tests/integration/api/` | 同上 | Route Handler ごとに: 未ログイン 401、入力の検証 400、正常系、主な `InfraError`、想定外のエラー。Application は `vi.mock` |
| Fuzz | `tests/integration/fuzz/` | 同上 | 全 Route に壊れた入力を送り、5xx を返さない・Slack に通知しないこと |
| PBT | `tests/pbt/` | 同上 | fast-check。読み取りの正規化、更新の検証、部屋の状態の性質 |
| 時刻・TZ | `tests/time/` | `npm run test:tz` | JST の境界（0:00〜9:00 は UTC で前日、6:00 / 23:00 は時間帯制限）。TZ=UTC / Asia/Tokyo / America/Los_Angeles で3回 |
| Emulator | `tests/emulator/` | `npm run test:emulator` | Route → Firestore Emulator に書いて読み戻す往復、状態遷移、Rules の全拒否、Emulator 上の fuzz |
| E2E | `e2e/` | `npm run e2e` | ログイン、ルーティング、ダッシュボード、予約の編集、宿泊税。重要なフローに絞る |

- Vitest の既定の設定（`vitest.config.ts`）は Emulator の接続先を **到達できないアドレス**（`127.0.0.1:1`）にしている。誤って Firestore を呼んだテストはすぐ失敗し、本番にも届かない
- 「今日」は `tests/utils/routeTestHelper.ts` の `setupFakeToday()` で 2026-05-20（JST）に固定する。JST の時刻を指定するときは `tests/utils/timeHelper.ts` の `setNowJST`
- E2E は本物の Firebase 認証を使わない。`session` Cookie を `context.addCookies` で置いて `proxy.ts` を通し、`/api/**` と Firebase Auth の REST を `page.route` でモックする。Emulator 系の環境変数は `playwright.config.ts` の `webServer.env` にある
- テストデータに実在の人名・本番データを入れない

## CI（`.github/workflows/ci.yml`）

`development` と `main` への push と PR で動く。

```
lint ─┐
typecheck ─┤
audit ─┼─→ unit-test（test + test:tz）─┬─→ emulator-test
secret-scan ─┤                          ├─→ e2e
semgrep ─┘                              └─→ zap-scan
```

| ジョブ | 内容 | 指摘を除外するとき |
|---|---|---|
| audit | `npm run audit:ci`。high 以上で、例外リストにないものがあれば失敗 | `scripts/ci/auditAllowlist.ts` に ID・パッケージ・理由・期限（最長3か月）を書く。アプリで脆弱なコードが動かないことを確かめてから |
| secret-scan | gitleaks で全履歴を検査 | `.gitleaksignore` に Fingerprint と理由。本物の秘密情報は除外せず、キーを無効化する |
| semgrep | `p/default` `p/typescript` `p/react`。1件でも失敗 | 該当行の前に `// nosemgrep: <ルールID>` と理由 |
| zap-scan | 本番ビルドを起動し、ZAP Baseline で `/login` を検査。WARN 以上で失敗 | `.zap/rules.tsv`（ASCII、タブ区切り、空行なし） |

Actions・ツール・Docker イメージは SHA / digest / 版で固定している。上げるときも固定の形を保つ。

## デプロイ（`.github/workflows/deploy.yml`）

`main` への push で動いた CI が成功したときだけ、CI が検査したコミット（`head_sha`）を Docker でビルドし、Cloud Run（`asia-northeast1`、サービス `ryokan-system`）へデプロイする。

- 認証は Workload Identity Federation（鍵ファイルなし）。イメージは Artifact Registry `asia-northeast1-docker.pkg.dev/<project>/ryokan/ryokan-system:<sha>`
- 実行用サービスアカウント `ryokan-runtime`。Firestore の読み書きと Session Cookie の発行・確認だけの権限
- Dockerfile は3段（deps → builder → runner）、`output: 'standalone'`、非 root、`PORT=8080`
- GitHub Secrets: `WORKLOAD_IDENTITY_PROVIDER`, `SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID`（ビルド時にクライアントへ埋め込む。build arg）, `SLACK_WEBHOOK_URL`（Cloud Run の実行時の環境変数）
- `firestore.rules` は自動では反映されない。変えたら開発者が `firebase deploy --only firestore:rules` を手で実行する

## 依存の追加・更新

- `.npmrc`: 公開から7日たっていない版は入れない（`min-release-age=7`）。install スクリプトは `package.json` の `allowScripts` に書いたものだけ（書いていないパッケージにスクリプトがあると `npm ci` が失敗する）
- Dependabot（`.github/dependabot.yml`）: npm・Actions・Docker を毎週月曜、`development` 宛てに PR。minor / patch はまとめる。Node の major と `@types/node` の major は手で上げる
- 依存を増やす前に、既存のもので足りないか考える。ブラウザ用の `firebase` は Auth だけを import する（Firestore を import すると CSP・bundle・audit に影響する）
