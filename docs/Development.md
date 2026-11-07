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
| 構成の固定 | `tests/unit/config/` | 同上 | ワークフローの `uses:` が SHA、Docker イメージが digest、CI のツールが正確な版、curl で取るバイナリのチェックサム検査。`.claude/settings.json` の拒否・確認の規則が残っていること |
| Integration | `tests/integration/api/` | 同上 | Route Handler ごとに: 未ログイン 401、入力の検証 400、正常系、主な `InfraError`、想定外のエラー。Application は `vi.mock` |
| Fuzz | `tests/integration/fuzz/` | 同上 | 全 Route に壊れた入力を送り、5xx を返さない・Slack に通知しないこと |
| PBT | `tests/pbt/` | 同上 | fast-check。読み取りの正規化、更新の検証、部屋の状態の性質 |
| 時刻・TZ | `tests/time/` | `npm run test:tz` | JST の境界（0:00〜9:00 は UTC で前日、6:00 / 23:00 は時間帯制限）。TZ=UTC / Asia/Tokyo / America/Los_Angeles で3回 |
| Emulator | `tests/emulator/` | `npm run test:emulator` | Route → Firestore Emulator に書いて読み戻す往復、状態遷移、Rules の全拒否、Emulator 上の fuzz、Session Cookie の失効（Auth Emulator のユーザーで本物のログイン API を通す） |
| E2E | `e2e/` | `npm run e2e` | ログイン、ルーティング、ダッシュボード、予約の編集、宿泊税。重要なフローに絞る |
| E2E（本番ビルド） | `e2e/prod/` | `npm run e2e:prod` | セキュリティヘッダー・CSP が、防ぐはずのこと（外への送信、埋め込み、注入した script、他のサイトからの読み込み・操作、カメラなど）を実際に止めること。各テストに対照実験（そのヘッダーだけを外すと止まらない）を置く |
| E2E（Emulator） | `e2e/emulator/` | `npm run e2e:emulator` | 本物のログイン（Auth Emulator）で受け取ったセッション Cookie の HttpOnly・SameSite=Strict・Max-Age が目的どおりに働くこと（属性を外す対照実験つき）。失効・無効化のあと、Cookie が残っていても画面がログインに戻ること |

- Vitest の既定の設定（`vitest.config.ts`）は Emulator の接続先を **到達できないアドレス**（`127.0.0.1:1`）にしている。誤って Firestore を呼んだテストはすぐ失敗し、本番にも届かない
- 「今日」は `tests/utils/routeTestHelper.ts` の `setupFakeToday()` で 2026-05-20（JST）に固定する。JST の時刻を指定するときは `tests/utils/timeHelper.ts` の `setNowJST`
- E2E は本物の Firebase 認証を使わない。`session` Cookie を `context.addCookies` で置いて `proxy.ts` を通し、`/api/**` と Firebase Auth の REST を `page.route` でモックする。Emulator 系の環境変数は `playwright.config.ts` の `webServer.env` にある（Emulator 本体は起動しない。ブラウザの Auth は Auth Emulator の URL に向かうが、`**/identitytoolkit.googleapis.com/**` のモックで捕まる）。URL と Cookie のホストは `localhost` ではなく `127.0.0.1` にそろえる
- Emulator の E2E（`playwright.emulator.config.ts`）は `firebase emulators:exec` の中で、開発サーバーを `127.0.0.1:3200` で起動する。`make` の Emulator が動いているとポートが衝突する
- 本番ビルドの E2E（`playwright.prod.config.ts`）は毎回 `next build` してから `next start -H 127.0.0.1 -p 3100` で起動する（既存のサーバーは再利用しない）。Emulator 系の変数は渡さないのでログインはできず、API はブラウザ側でモックするか未ログインの応答を見る。本番は 23:00〜6:00 JST に全ページを `/time-restricted` に回すので、どの時刻でも成り立つように書く
- 攻撃者のサイトは `page.route` で作る別オリジン（`http://localhost:4999`）。Chrome の Local Network Access がそのページから 127.0.0.1 への読み込みを先に止めるので、本番ビルドの E2E のブラウザでは `--disable-features=LocalNetworkAccessChecks` で無効にしている
- テストデータに実在の人名・本番データを入れない

### テストを書くときの決まり

- **バグを直すときは、最小の再現ケースを回帰テストにし、修正前に落ちることを確かめる。** 置き場所: 純粋関数・Domain・`toReservation` → `tests/unit/`、Route の入力と status → `tests/integration/`、Firestore に書いて読む経路・状態遷移 → `tests/emulator/`、時刻・TZ → `tests/time/`、画面操作・自動保存 → `e2e/`
- 直したら、同じ原因が他にないか全体を grep する。このプロジェクトで実際にあった原因: 入口の Zod に refine がない（日付の前後・実在日・配列の長さ）、`request.json()` を catch していない、ローカル時刻への依存（`getMonth()` / `getDate()`、`toISOString()`、`new Date('YYYY-MM-DD')`）、外部呼び出しを try の外で行う、失敗した保存を捨てる・応答を待たずに次を送る、`FieldValue.arrayUnion`（同じ内容を足さない）、今の状態を確かめずに状態を変える
- Route を追加したら `tests/integration/fuzz/routes.fuzz.test.ts` の `ROUTES` に足す（export された Route と突き合わせるので、足さないと落ちる）
- Emulator のテストで作るドキュメントは `emutest-` などの接頭辞を付け、最後に消す。`make` の Emulator が動いているとポートが衝突する
- firebase-admin は Auth Emulator に接続しているとき、`verifySessionCookie` の `checkRevoked` の指定に関係なく失効を確かめる。`checkRevoked` を渡していることは Emulator のテストでは見分けられないので、unit テスト（`tests/unit/lib/verifySession.test.ts`）で見る
- `tests/time/` の期待値は具体的な値で書く。スナップショットは最初に実行した TZ の値で固まるので使わない
- PBT の性質は仕様（[Domain.md](Domain.md)）から立てる。コードを読んでから立てるとバグに合わせた性質になる。条件を満たす入力だけで確かめる性質は、条件を満たした件数も検査する（少なすぎると何も確かめていない）。生成器は `tests/utils/arbitraries.ts`
- 空白・NUL 文字・`%2F` は Firestore のドキュメント ID として有効。入口で拒否せず、存在しなければ 404
- テストはモックの外を見られない。env・認証・DB・SSR・CSP に触れる変更は、`make` で起動して実際に操作して確かめる（`run` スキル）。本番の Firestore には触れない

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

Actions・ツール・Docker イメージは SHA / digest / 版で固定している（`tests/unit/config/pinning.test.ts` が検査する）。上げるときも固定の形を保つ（Actions はタグが指すコミットの SHA を書き、行末に版をコメントで書く。ツールは公開から7日以上たった版）。Dependabot は Semgrep と ZAP のイメージ、CI の `firebase-tools` を更新しないので手で上げる。ZAP を上げると新しいルールで CI が落ちることがある。

Semgrep を手元で試す: `docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.182.1 semgrep scan --metrics=off --config p/default --config p/typescript --config p/react`

未実装: PR ごとの staging 環境、CI 失敗時の Slack 通知、ZAP の Full Scan。

## デプロイ（`.github/workflows/deploy.yml`）

`main` への push で動いた CI が成功したときだけ、CI が検査したコミット（`head_sha`）を Docker でビルドし、Cloud Run（`asia-northeast1`、サービス `ryokan-system`）へデプロイする。

- 認証は Workload Identity Federation（鍵ファイルなし）。イメージは Artifact Registry `asia-northeast1-docker.pkg.dev/<project>/ryokan/ryokan-system:<sha>`
- 実行用サービスアカウント `ryokan-runtime`。Firestore の読み書きと Session Cookie の発行・確認だけの権限
- Dockerfile は3段（deps → builder → runner）、`output: 'standalone'`、非 root、`PORT=8080`
- GitHub Secrets: `WORKLOAD_IDENTITY_PROVIDER`, `SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID`（ビルド時にクライアントへ埋め込む。build arg）, `SLACK_WEBHOOK_URL`（Cloud Run の実行時の環境変数）
- `firestore.rules` は自動では反映されない。変えたら開発者が `firebase deploy --only firestore:rules` を手で実行する
- デプロイの開始・結果と PR の作成は、Slack の GitHub アプリが通知する（ワークフローの中では通知しない）

GCP 側の権限は最小にしてあるので、次の変更は GCP の設定も変えないと本番で失敗する:

| 変更 | 起きること |
|---|---|
| `deploy.yml` のファイル名・ワークフローの移動、`main` 以外からのデプロイ | WIF の属性条件（リポジトリ・`refs/heads/main`・`deploy.yml`）に合わず、auth のステップで拒否される |
| Firestore・Auth 以外の GCP サービスをアプリから使う（Secret Manager、Storage など） | 実行用 SA `ryokan-runtime` に権限がない。Firebase Auth もカスタムロールで `createSession` と `users.get` だけ（ユーザーの作成・削除はできない）。権限不足は 503 と Slack の `PERMISSION_DENIED` になる |
| 公開設定（`--allow-unauthenticated`）を `deploy.yml` に足す | デプロイ用 SA は `run.developer` で、公開設定を変えられない。公開（`allUsers` に `run.invoker`）はサービスに付いたまま残っている |
| 別の Cloud Run サービス・Artifact Registry リポジトリへのデプロイ | デプロイ用 SA の権限は `ryokan-system` と `ryokan` にだけ付いている |

## 依存の追加・更新

- `.npmrc`: 公開から7日たっていない版は入れない（`min-release-age=7`）。install スクリプトは `package.json` の `allowScripts` に書いたものだけ（書いていないパッケージにスクリプトがあると `npm ci` が `ESTRICTALLOWSCRIPTS` で失敗する）。出たらそのパッケージのスクリプトを読み、不要なら `npm install-scripts deny <pkg>`、必要なら `npm install-scripts approve <pkg>`。今ある5つはすべて `false`（動かさなくてもアプリとテストは動く）。`npm install -g` は `.npmrc` も `allowScripts` も読まない
- Node は CI・Docker・`@types/node` の major を 26 にそろえる（npm は Node 26 付属の 11）
- Dependabot（`.github/dependabot.yml`）: npm・Actions・Docker を毎週月曜、`development` 宛てに PR。minor / patch はまとめる。`vitest`・`@vitest/*` と `@mui/*` は major も含めてそれぞれ1つの PR にする（版をそろえないと動かない）。Node の major と `@types/node` の major は手で上げる。セキュリティ更新の自動 PR は `main` 宛てにしか作れないので無効にしている。実際に悪用されている脆弱性は7日待たず `npm install <pkg>@<修正版> --min-release-age=0` で上げ、数日以内にデプロイする
- `npm audit` の moderate（21件）と high（4件）は残っている（2026-11-04 確認）。moderate の実体は2つ: `minimatch`（`eslint` 経由。開発ツールだけ）と `glob`（`firebase-admin` 14 → `google-gax` → `rimraf@5` 経由。`rimraf@5` が glob 10 系を要求し、10 系に修正版がない。AbortSignal もパターンも渡さないので悪用の経路はない）。high は例外リストの grpc-js。**`npm audit fix --force` は使わない**（`firebase-admin` や `eslint-config-next` を大きく古い版に下げる）
- 依存を増やす前に、既存のもので足りないか考える。ブラウザ用の `firebase` は Auth だけを import する（Firestore を import すると CSP・bundle・audit に影響する）
