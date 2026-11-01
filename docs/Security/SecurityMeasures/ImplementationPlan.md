# 実装プラン（T1〜T8）

`README.md` の実施計画（P0〜P4）を、作業のステップに分けたもの。各ステップは「Claude が編集する部分」と「開発者が手で設定・確認する部分」に分ける。

- 🤖 **Claude**: リポジトリの中のファイル（コード、テスト、workflow、設定ファイル、docs）の編集。
- 👤 **開発者**: リポジトリの外の設定（GitHub、GCP、Firebase、開発 PC）、本番の値の確認、push・マージ・デプロイ。

AI エージェントには push・デプロイ・本番の操作をさせない（T5-7）ので、👤 の作業は Claude には頼めない。

## 決定事項（2026-11-01）

| 項目 | 決定 |
|---|---|
| 削除した文書（`Checklist.md`、`IaC.md`、`Detection.md`、`IncidentResponse.md`、`Inspection.md`、`Dependencies.md`）への参照 | 参照の文言だけ消す。中身は補わない（Step 0） |
| T5 の表の「GCP の管理操作を通知して気付く」 | 行わない。表から消す（Step 0） |
| T7-5（400 の Zod の詳細） | 本番では返さない（Step 1-10） |
| T8-4（Slack の Webhook を Secret Manager に移す） | 行わない。今のまま Cloud Run の環境変数に置く。通知は専用のチャンネルで、通知に機密情報を入れなければ漏れても被害は小さい。`Rejected.md` に書く（Step 0） |
| T5-9（デプロイの通知）の Webhook | 今の `SLACK_WEBHOOK_URL` をそのまま使う（Environment `production` に移したもの） |
| 大きなコード変更（T1-2〜5、P4 Terraform） | このプランでは概要だけ書き、後日、別のブランチで実装する（P2〜P4） |

## 進め方

- ブランチは `development` から切る。ステップのまとまりごとにブランチを分けてよい（例: `security/p1-ci`、`security/p1-deploy`）。
- コミットは開発者が行う。下の「コミットの単位」は目安で、実際の単位はステップごとに相談して決める。
- CI/CD を変えるステップでは `.github/workflows/*.yml` と `docs/CICD.md` を同時に更新する（AGENTS.md）。
- 対策が終わったら、今の実装の説明を `docs/Security/Security.md` に移し、`Tx.md` の該当の行に「済」と書く（`README.md` のルール）。
- ライブラリ・GitHub Actions・GCP の設定の書き方は、着手時に Context7 か公式 docs で確かめる。

---

## Step 0: 文書の整理（🤖）（済）

| 作業 | ファイル |
|---|---|
| 削除した文書への参照を消す | `README.md`（ファイル一覧の6行、P0・P1 の「`Checklist.md` で P0 とした項目」など、P4 の `IaC.md`）、`T4.md`、`T5.md`、`T6.md`（冒頭、T6-2、T6-3、T6-5）、`T8.md`（T8-6）、`Rejected.md`（ログアウトボタン）、`SecurityPolicy.md`（T6 の方針の「期限は `Dependencies.md`」） |
| T5 の表の「GCP の管理操作を通知して気付く」を消す | `T5.md` |
| T8-4 を `Rejected.md` に移し、`T8.md` の行に「採用しない（`Rejected.md`）」と書く | `T8.md`、`Rejected.md` |
| `README.md` のファイル一覧に、このファイルを加える | `README.md` |

コミットの単位: 1つ。

---

## P0: 設定の変更（ほぼ 👤）

SSH 鍵1つで本番に届く今の経路を、最初に塞ぐ。

### Step P0-1: `main` と `development` の保護（T5-1）（保留）

> 保留: 非公開リポジトリのルールセットは GitHub Pro 以上でないと効かない。GitHub Student Developer Pack（GitHub Pro を含む）を申請中なので、承認されてから行う。Step 1-2 の Environment `production`（Deployment branches の制限）も同じ理由で、承認後に行う。

👤 開発者
1. GitHub → Settings → Rules → Rulesets で、`main` のルールセットを作る。
   - Require a pull request before merging（承認の人数は 0）
   - Require status checks to pass: `Lint`、`Type Check`、`npm audit`、`Unit Test`、`Emulator Round-trip Test`、`E2E Test`（P1 で Semgrep・gitleaks を足したら、それも加える）
   - Block force pushes、Restrict deletions
   - Bypass list は空にする
2. `development` にも、status checks と force push の禁止を付ける。
3. 確認: `main` に直接 push して拒否されることを確かめる。

🤖 Claude
- `docs/CICD.md` の「Branch Protection」を、推奨ではなく実際の設定として書き直す。

### Step P0-2: WIF の条件を絞る（T5-3）

👤 開発者
1. 今の provider の設定を確認する（`gcloud iam workload-identity-pools providers describe github-provider --location=global --workload-identity-pool=github-pool`）。属性の対応付けと条件を控える。
2. 属性の対応付けに `attribute.ref=assertion.ref`、`attribute.workflow_ref=assertion.workflow_ref` を加え、条件を設定する。
   `assertion.repository == '<owner>/<repo>' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref.startsWith('<owner>/<repo>/.github/workflows/deploy.yml@')`
   - `workflow_run` で動く deploy の `workflow_ref` と `ref` が実際に何になるかは、1回デプロイして Cloud Audit Logs で確かめてから条件を確定する（大文字・小文字も合わせる）。
3. P1-2（Environment）のあとに `&& assertion.environment == 'production'` を加える。
4. 確認は P1-2 の確認とまとめて行う。

🤖 Claude
- `GCP_SETUP.md` §6 の provider 作成コマンドを、新しい属性の対応付けと条件に書き直す。（済）

### Step P0-3: デプロイ用のサービスアカウントの権限（T5-4）

👤 開発者
1. `github-actions-deployer` から、プロジェクト全体の `roles/run.admin` と `roles/artifactregistry.writer` を外す。
2. 対象のリソースにだけ付け直す。
   - Cloud Run サービス `ryokan-system` に `roles/run.developer`
   - 実行用のサービスアカウント（P1-2 で作る。それまでは今のもの）に `roles/iam.serviceAccountUser`
   - Artifact Registry のリポジトリ `ryokan` に `roles/artifactregistry.writer`
3. 確認: 次のデプロイが成功すること。

🤖 Claude
- `GCP_SETUP.md` §4 を、リソースごとの付与に書き直す。

### Step P0-4: オーナー権限の分離とパスキー（T5-5、T5-6）

👤 開発者
1. オーナー用の Google アカウントを別に用意し、GCP プロジェクトのオーナーにする。
2. 普段のアカウントからオーナーを外し、閲覧系の権限（`roles/logging.viewer`、`roles/run.viewer`、`roles/datastore.viewer` など、必要なもの）だけを付ける。`anonymize` で使う `anon-reader` の `roles/iam.serviceAccountTokenCreator` は普段のアカウントに残す。
3. オーナー用のアカウントは、別のブラウザのプロファイルでだけログインする。
4. GitHub、普段の Google、オーナー用の Google のすべてにパスキーを登録する。

### Step P0-5: 開発 PC の設定（T5-8）

👤 開発者
1. VS Code の `security.workspace.trust.enabled` が `true` であることを確認する。
2. SSH 鍵にパスフレーズを付ける（`ssh-keygen -p -f ~/.ssh/<鍵>`）。
3. 素性の分からないリポジトリは Dev Container か Codespaces で開く、と決めておく。

### Step P0-6: その他の P0（T5-10、T1、README の P0）

👤 開発者
1. GitHub → Settings → Code security で Secret scanning を有効にする（T5-10）。
2. Firebase Authentication で新規登録が API レベルで無効になっていることを確認する（Authentication → Settings → User actions の「Enable create (sign-up)」がオフ）。確認として、公開の API キーで `accounts:signUp` を呼び、拒否されることを確かめる。
3. GCP の予算アラートを設定する（DDoS の請求額を抑える。`SecurityPolicy.md` §8）。

---

## P1: コードと設定

### Step 1-1: CI の権限と固定（T6-6、T6-7）

🤖 Claude
1. `ci.yml` の全体の `permissions` を `contents: read` にし、`zap-scan` のジョブにだけ `issues: write` を付ける。（済。非公開リポジトリで checkout が失敗したため先に行った）
2. `ci.yml` と `deploy.yml` の全アクションをコミット SHA に固定し、行末にバージョンをコメントで残す（`pinact` を使うか手で調べる。`pinact` を開発 PC に入れるかは着手時に相談する）。
3. `npx wait-on` と `npm install -g firebase-tools@15` を、正確なバージョンに固定する。
4. `docs/CICD.md` を更新する。

👤 開発者
- GitHub → Settings → Actions → General で、アクションを SHA に固定することを必須にする（設定項目の名前は着手時に確認）。

コミットの単位: 1つ（CI の変更）。

### Step 1-2: deploy の経路と実行用のサービスアカウント（T5-2、T6-1、T6-8、T6-10、T5-9）

> Environment `production` に関わる作業（👤 の 3・4、🤖 の `environment: production`、マージ後の 4・5）は、GitHub Pro が使えるようになってから行う（P0-1 の保留を参照）。それ以外は先に進めてよい。

👤 開発者（先に行う）
1. 実行用のサービスアカウント（例: `ryokan-runtime`）を作り、Firestore と Firebase Auth に必要な権限だけを付ける。候補は `roles/datastore.user` と `roles/firebaseauth.admin`。`createSessionCookie` と `verifySessionCookie(cookie, true)` に必要な権限は、着手時に公式 docs で確かめる。
2. P0-3 の `roles/iam.serviceAccountUser` を、このサービスアカウントに付ける。
3. GitHub → Settings → Environments で `production` を作り、Deployment branches を `main` だけにする。
4. `WORKLOAD_IDENTITY_PROVIDER`、`SERVICE_ACCOUNT`、`GCP_PROJECT_ID`、`SLACK_WEBHOOK_URL`、`NEXT_PUBLIC_FIREBASE_*` を Environment に登録し、リポジトリ全体の secrets から削除する（`NEXT_PUBLIC_FIREBASE_*` は deploy だけが使うので一緒に移す）。

🤖 Claude
1. `deploy.yml`
   - `if:` に `github.event.workflow_run.event == 'push'` を加える（T6-8）。
   - checkout と image の tag を `github.event.workflow_run.head_sha` にする（CI が検査したコミットをデプロイする）。
   - deploy ジョブに `environment: production` を付ける（T5-2）。
   - `deploy-cloudrun` に実行用のサービスアカウントを渡す（`--service-account`。名前は Environment の secret か `env:` に置く）（T6-1）。
   - 最後に Slack への通知のステップを加える（T5-9）。中身はコミットの SHA、コミットした人、ワークフローの実行 URL。値は `run:` に `${{ }}` で直接埋め込まず、`env:` を通して渡す（コミットした人の名前などによるスクリプトの注入を防ぐ）。通知に secret の値を入れない。
2. `.dockerignore` と `.gitignore` に `gha-creds-*.json` を加える（T6-10）。
3. `docs/CICD.md`（Deploy、Required Secrets）と `GCP_SETUP.md`（§5 の実行用のサービスアカウント、§7 の secrets の置き場所）を更新する。

👤 開発者（マージのあと）
1. デプロイが成功し、Slack に通知が来ることを確かめる。
2. Cloud Run の画面で、実行用のサービスアカウントが新しいものになっていることを確かめる。ログイン・閲覧・保存が動くことを本番で確かめる。
3. 既定の Compute Engine のサービスアカウントから `roles/firebase.admin` を外す（ほかに使っていないことを確かめてから）。
4. P0-2 の 3（`assertion.environment == 'production'`）を加える。
5. 確認（T5-2・T5-3）: 適当なブランチに、`id-token: write` と `google-github-actions/auth` を使う確認用のワークフローを push し、secrets が空で GCP の認証が失敗することを確かめる。確かめたらブランチを削除する。

コミットの単位: `deploy.yml` と docs、`.dockerignore`/`.gitignore` の2つ。

### Step 1-3: Node.js 24 と `.npmrc`（T6-4、T6-5）

🤖 Claude
1. `Dockerfile` の3つの stage を `node:24-alpine` にする。`ci.yml` の `node-version` を 24 にする。`@types/node` を `^24` にする。
2. Node 24 に付いている npm のバージョンを確かめる。`min-release-age` は npm 11.10 以降でしか効かないので、足りなければ CI と Dockerfile で npm を固定のバージョンに上げるかを相談する。
3. `.npmrc` に `min-release-age=7` と `ignore-scripts=true` を書く。Dockerfile の `deps` stage で `.npmrc` も COPY する（今は `package.json` と `package-lock.json` だけ）。
4. `ignore-scripts=true` で壊れるものがないかを確かめる: `npm ci` → `lint` → `tsc` → `test` → `build` → `e2e` → `test:emulator`。install スクリプトを使うパッケージ（`esbuild`、`unrs-resolver`、`sharp` など）は、`npm ci` のログと `npm query ':attr(scripts, [postinstall])'` などで洗い出し、必要なものだけ扱いを決める。
5. `docs/CICD.md`、`docs/LocalDevelopment.md`（Node のバージョン）を更新する。

👤 開発者
- 開発 PC の Node を 24 にする。今の開発 PC は Node 22 / npm 12 なので、npm の扱いも合わせる。

コミットの単位: Node の更新と `.npmrc` で2つ。

### Step 1-4: Dependabot（T6-3）

🤖 Claude
1. `.github/dependabot.yml` を作る。対象は `npm`、`github-actions`、`docker`。頻度は週1、`cooldown`（公開から数日待つ設定）を付ける。PR の宛先は `development` にする。
2. 更新の手順（悪用が報告された脆弱性は数日以内に修正版をデプロイする、など）を `T6.md` に1〜2行で書くか、開発者と相談する。

👤 開発者
- GitHub → Settings → Code security で Dependabot alerts と security updates を有効にする。

### Step 1-5: ZAP の指摘で CI を失敗させる（T6-9）

🤖 Claude
1. `.zap/rules.tsv` を作り、`Security.md` で対応不要と決めた指摘（10055、10109、Non-Storable Content）を `IGNORE` にする。
2. `ci.yml` の ZAP のステップに `rules_file_name` を渡し、`fail_action` を変えて、新しい指摘で失敗させる。WARN でも失敗するかなど、action の挙動は着手時に README で確かめる。
3. ローカルか PR の CI で、今の状態が通ることを確かめる。
4. `Security.md`（ZAP 指摘の扱い）と `docs/CICD.md` を更新する。

### Step 1-6: `firestore.rules` の管理とテスト（T6-2）

🤖 Claude
1. 全拒否の `firestore.rules` を作り、`firebase.json` から参照する。
2. `tests/emulator/` に、Client SDK（ID トークンあり・なし）から `guestInfoV2` と `dailyInfo` の読み書きが拒否されることを確かめるテストを加える。使うライブラリ（`@firebase/rules-unit-testing` を devDependencies に加えるか、今ある `firebase` で書くか）は着手時に相談する。

👤 開発者
1. 本番のルールとリポジトリの `firestore.rules` が同じであることを Firebase コンソールで確かめる。
2. ルールの本番への反映は手で行う（`firebase deploy --only firestore:rules`）。エージェントには実行させない。

### Step 1-7: Semgrep と gitleaks（T7-1、T8-1、T8-5）

🤖 Claude
1. `ci.yml` に `semgrep` のジョブを加える（Community Edition。TypeScript と Next.js のルールセット）。最初の実行で出た指摘は、直すか、理由を付けて除外する。
2. `ci.yml` に `gitleaks` のジョブを加える。PR の差分を検査する。設定ファイル（`.gitleaks.toml`）が要るかは最初の実行で判断する。
3. `docs/CICD.md` を更新する。

👤 開発者
1. gitleaks で全履歴を一度だけ検査する（`gitleaks git .`）。見つかったら、履歴から消すより先にキーを無効化する。
2. P0-1 のルールセットの必須チェックに、2つのジョブを加える。
3. リポジトリを公開に切り替える前には、もう一度全履歴を検査する（T8-5）。

コミットの単位: Semgrep と gitleaks で2つ。

### Step 1-8: レビューの観点と運用のルール（T7-2、T7-3、T8-2、T8-3）

🤖 Claude
1. `docs/Review.md` のセキュリティ観点に加える。
   - 入力の長さ・件数の上限
   - エラーのレスポンス・ログ・Slack に、内部の情報や個人情報を出さない
   - 新しい入口（Route、外部サービス）を加えたら、`SecurityPolicy.md` の §5 と §7 を更新する
   - 新しい Route は `tests/integration/fuzz/routes.fuzz.test.ts` の `ROUTES` に加える（T7-3）
   - テストデータは `seed` か `anonymize` から作り、実データを `tests/`、`e2e/`、`docs/`、Issue、PR、エージェントへの指示に貼らない（T8-2）
2. `docs/LocalDevelopment.md` の `anonymize` の手順に「実行中は AI エージェントを動かさない」を加える（T8-3）。

### Step 1-9: 予約 API の上限（T7-4）

AGENTS.md の順（テスト → 実装）で進める。

🤖 Claude
1. `scripts/localdev/lib/shapeReport.ts` を拡張し、フィールドごとの文字列の最大長と配列の最大件数も数える（値は含めない）。
2. 👤 の計測の結果を受けて、上限を `src/constants/` に置く。
3. `tests/unit/constraints/` と `tests/integration/api/reservations/` に、上限ちょうど・上限+1 のテストを書く。
4. `src/lib/api/reservationSchemas.ts` の書き込み側（`ReservationPatchBodySchema`、`MailMemoEntrySchema`、`NewReservationBodySchema`）に上限を入れる。読み取り側（Infra の Zod）には入れない。
5. 画面の入力欄に同じ上限を付けるかは相談する（付けないと、上限を超えたときに保存が 400 で失敗する）。

👤 開発者
- AI エージェントを止めた状態で `npm run anonymize` を実行し、形のレポートから最大長・最大件数を Claude に伝える。

### Step 1-10: 400 で Zod の詳細を返さない（T7-5）

🤖 Claude
1. `src/lib/api/` に、400 の Response を作る関数を1つ作る。production では `{ error }` だけを返し、詳細は `logger.warn` に出す。development / test では今と同じく `details` を返す。
2. `details: parsed.error.flatten()` を返している8つの Route（`reservations`、`reservations/[id]`、`[id]/cancel`、`[id]/restore`、`[id]/a-tax`、`a-tax-table`、`daily/[date]/todos`、`daily/[date]/safe-balance-checker`）を、その関数に置き換える。
3. integration test で、production のときに `details` がないことを確かめる。hooks が `details` を使っていないことを確かめる。

### Step 1-11: ログイン成功時の IP 通知（T1-1）

🤖 Claude
1. `src/app/api/auth/login/route.ts` で、ログインに成功したら、接続元 IP とアカウント（uid）を `logger.info` と Slack に出す。request body（idToken）は出さない。
2. IP は `X-Forwarded-For` から取る。Cloud Run で、クライアントが送った値と Google が付けた値のどれが信頼できるかを着手時に確かめ、取り出す関数を `src/lib/` に置いて unit test を書く。
3. integration test（`tests/integration/api/auth/login/route.test.ts`）に、成功時に通知し、失敗時には通知しないことを加える。

👤 開発者
- デプロイしたあと、数週間 Slack の通知を観察し、旅館の IP が固定かどうかを記録する（P2 の端末登録の設計に使う）。

### Step 1-12: AI エージェントの権限の制限（T5-7）

🤖 Claude
1. `.claude/settings.json` を作り、`permissions.deny` に `git push`、`gcloud`、`firebase deploy`、`~/.ssh/**` と `~/.config/gcloud/**` の読み取りを入れる。書き方は着手時に Claude Code の docs で確かめる。
2. Codex を使う場合は、同じ制限を Codex の設定にも入れる（`.codex/` は今は空。使うかどうかは着手時に確認する）。

👤 開発者
1. Claude に `git push` を頼み、拒否されることを確かめる。
2. WSL でサンドボックスが使えるかを確かめる。

### Step 1-13: バックアップ（T5-11）

👤 開発者
1. Firestore の PITR と削除保護を有効にする。
2. 定期バックアップ（スケジュール）を作る。保存期間を決める。
3. 復元の手順を一度試す（別のデータベースに復元するなど）。

🤖 Claude
- 開発者の設定の結果を `Security.md` に書く。

---

## 大きなコード変更（概要のみ。後日、別のブランチで実装する）

着手するときに、設計を該当する `Tx.md` に追記してから進める（`README.md` の進め方）。

### P2: 端末登録（T1-2。T2・T3 にも効く）

- `/api/auth/login` で、Session Cookie を発行する前に端末 Cookie を確認する。
- Firestore に端末の登録を置く（アカウントごとの端末、最後にログインした IP と時刻）。
- 初回利用時の自動登録、ログインのたびの期限の延長、同じ IP からの追加の登録、未登録の端末の拒否と Slack 通知（`T1.md` の「端末登録の進め方」）。
- Step 1-11 の IP の観察の結果を前提にする。
- 実装の順: E2E → domain の unit test → domain → infra → application → hooks → integration test → UI。

### P3: ログインのサーバー経由化、失敗回数の制限、パスワードの形式チェック（T1-3〜5）

- ログイン API がメールアドレスとパスワードを受け取り、サーバーが Identity Toolkit を呼ぶ。サーバー専用の API キーを作り（Secret Manager）、古い公開のキーは削除する（👤）。
- ブラウザ用の `firebase` パッケージを削除し、CSP の `connect-src` から Identity Toolkit を外し、npm audit の例外（grpc-js）を削除する。
- 判定の順は「端末の確認 → 回数制限 → パスワードの判定」。カウンターは Firestore に置く。
- パスワードの長さ（10〜100）を Zod で確認する。
- request body をログや Slack に出さない。

### P4: Terraform による設定のコード化

- P0・P1 で手で行った GCP の設定（サービスアカウント、IAM、WIF、Artifact Registry、Cloud Run、予算アラート、バックアップ）を Terraform にし、ずれを自動で検知する。
- GitHub の設定（ルールセット、Environment）を含めるかは着手時に決める。
- P1 が終わったあとなら、いつ始めてもよい。

---

## T2・T3・T4（受容）

コードの変更はない。端末登録（P2）と IP 通知（Step 1-11）で効果が出る。

👤 開発者（任意）
- スタッフに1行だけ周知する：「Web ページが『何かを貼り付けて実行して』と言ってきたら、100% 攻撃」（T2）。

## 着手時に確かめること

| ステップ | 確かめること |
|---|---|
| P0-2 | `workflow_run` で動く deploy の OIDC トークンの `ref` と `workflow_ref` の実際の値 |
| 1-2 | 実行用のサービスアカウントに必要な最小の権限（Session Cookie の発行と失効の確認） |
| 1-3 | Node 24 の npm のバージョンと `min-release-age` の対応。`ignore-scripts=true` で動かなくなるパッケージ |
| 1-5 | ZAP の action で、WARN の指摘でも失敗させる設定 |
| 1-6 | ルールのテストに使うライブラリ |
| 1-11 | Cloud Run の `X-Forwarded-For` で信頼できる位置 |
| 1-12 | `.claude/settings.json` の deny の書き方。Codex を使うか |
