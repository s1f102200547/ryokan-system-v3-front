# Security Measures（セキュリティ対策と実施計画）

## 1. この文書の位置づけ

- `docs/SecurityPolicy.md` の脅威（T1〜T8）と方針にもとづく、**具体的な対策**、実施計画、点検・検知・インシデント対応の手順を書く。
- 各対策には、効く脅威を書く。どの脅威にも効かない対策は入れない（`docs/SecurityPolicy.md` §1）。
- 対策が終わったら、今の実装の説明を `docs/Security.md` に移し、この文書の該当箇所は「済」にする。

## 2. 脅威ごとの対策

### T1: ボットによる総当たり

| 順番 | 内容 |
|---|---|
| 1 | **ログインに成功したときの接続元 IP を Slack に通知する**。数週間観察し、旅館の IP が固定なら IP 制限を検討する |
| 2 | **端末登録**（T3 と共通）。登録した4台の PC の端末 Cookie がなければ、パスワードを見る前に拒否する |
| 3 | **ログインをサーバー経由にする**。ブラウザはアプリのログイン API にだけ送り、Google への問い合わせはサーバーが行う。API キーは作り直してサーバー専用にし（Secret Manager）、古いキーは削除する（裏口をなくす） |
| 4 | **失敗回数の制限**。アカウントごと・端末ごとに連続5回まで。超えたら15分待たせ、繰り返すたびに待ち時間を延ばす。IP ごとに1時間で20回を超えたら Slack に通知する |
| 5 | **パスワードの事前チェック**。15文字未満なら、Google に問い合わせる前に拒否する。メッセージは通常の失敗と同じにする |
| 6 | **Firebase のパスワードポリシー**。最小15文字・Require モードにする。先にスタッフ全員のパスワードを20文字のランダムなものに作り直す（Identity Platform の機能。使えるかは要確認） |

**設計上の注意**

- 判定の順番は **端末の確認 → 回数制限 → パスワードの判定** にする。こうすれば、端末を持たない攻撃者はアカウントをロックさせることもできない（スタッフを締め出す DoS を防ぐ）。
- 回数のカウンターは Firestore に置く。Cloud Run は複数のインスタンスで動くので、メモリ上のカウンターは効かない。
- サーバー経由にすると、パスワードがサーバーを通る。request body をログや Slack に出さない。
- サーバー経由にすれば、ブラウザ用の `firebase` パッケージは不要になる。そのとき CSP の `connect-src` から Identity Toolkit を外し、npm audit の例外（grpc-js）も削除する。

### T2: ClickFix などで PC が感染し、パスワードや Cookie を盗まれる

- 端末登録（T1-2）で、**パスワードだけを盗まれた場合は外から使えない**ようにする。Cookie まで盗まれた場合は DBSC で補う（T4）。
- 外からのログインは、T1-1 の IP 通知で気付ける。
- （任意）スタッフに1行だけ周知する：「Web ページが『何かを貼り付けて実行して』と言ってきたら、100% 攻撃」。

### T3: パスワードの盗み見・持ち出し

- 端末登録（T1-2）で、持ち帰ったパスワードを登録していない PC では使えないようにする。
- 開発者ツールで端末 Cookie までコピーされる場合は、DBSC で塞ぐ（T4）。

### T4: Session Cookie のコピー

- **すでに効いている点**: セッションは当日 23:00 で切れる。`HttpOnly` と `SameSite=Strict` を付けている。紛失時は、Firebase でアカウントを無効にすれば次の API 呼び出しから 401 になる（`verifySessionCookie(cookie, true)` で毎回失効を確認しているため）。
- 端末登録（T1-2）で、端末 Cookie のない PC からはログインできなくする。ただし、セッション Cookie そのものをコピーされた場合は防げない。
- 将来（余力があれば）**DBSC（Device Bound Session Credentials）** を入れる。Cookie を数分で切れる短命のものにし、更新のたびに PC のセキュリティチップ（TPM）の鍵で証明させる。コピーされた Cookie は数分で使えなくなる。端末 Cookie にも適用すれば、本当にその PC でなければ使えなくなる。
- DBSC に対応しているのは Windows 版の Chrome（146 以降）で、Edge の対応状況は要確認。

### T5: 開発者・管理者アカウントの乗っ取り

| 順番 | 内容 |
|---|---|
| 1 | GitHub と Google アカウント（GCP・Firebase のオーナー）に**パスキー**を登録する |
| 2 | GCP の IAM で、本番を操作できるのが**自分とデプロイ用のサービスアカウントだけ**か確認する。サービスアカウントの鍵ファイルを発行していないことも確認する |
| 3 | Workload Identity Federation の provider に `attribute_condition` を付け、**このリポジトリの main だけ**が GCP に入れるようにする |
| 4 | GitHub の `main` と `development` をルールセットで保護する（PR を必須、CI の合格を必須、force push を禁止）。デプロイ用の secrets は Environment `production`（main だけが使える）に移す |
| 5 | Secret scanning を有効にする（push protection は非公開リポジトリでは有料なので、T8-1 の gitleaks で代わりにする） |
| 6 | AI エージェントには本番の認証情報を渡さない（`runtimeEnvGuard` で担保済み）。生成されたコードは CI とレビューを通す |
| 7 | 被害を小さくするため、Firestore の PITR（過去の時点への復元）と削除保護を有効にする |

### T6: 既知の脆弱性・悪性パッケージの悪用

| 順番 | 内容 |
|---|---|
| 1 | Cloud Run を**専用のサービスアカウント**（Firestore と Firebase Auth に必要な権限だけ）で動かす。被害の範囲を小さくする |
| 2 | Firestore Security Rules を**全拒否**にする（`firestore.rules` で管理し、Emulator でテストする）。サーバーは Admin SDK を使うので影響しない。E3 を塞ぎ、端末登録を回り込めないようにする前提でもある |
| 3 | **Dependabot**（`npm`、`github-actions`、`docker`）を追加する（§9） |
| 4 | Node.js を 24 LTS に更新する（20 は 2026-04-30 にサポートが終了した） |
| 5 | `.npmrc` に `min-release-age=7`（npm 11.10 以降）と `ignore-scripts=true` を設定する（§9） |
| 6 | GitHub Actions を**コミット SHA に固定**し、リポジトリ設定で SHA 固定を強制する（`pinact` で自動化できる）。CI で使うツール（`wait-on`、`firebase-tools`）もバージョンを固定する |
| 7 | CI の `permissions` を最小にする。全体は `contents: read` にし、`issues: write` は ZAP のジョブだけに付ける |
| 8 | deploy を **push で CI が成功したときだけ**（`workflow_run.event == 'push'`）にし、**CI が検査したコミット**（`head_sha`）をデプロイする |
| 9 | ZAP は対応不要と決めた指摘を rules ファイルで除外し、新しい指摘で CI を失敗させる |

### T7: ソースコードの欠陥（AI が生成したコードを含む）

**すでに効いている対策**

- TypeScript の型チェックと、Route Handler の入口での Zod 検証
- `tests/integration/fuzz/routes.fuzz.test.ts` が `src/app/api/` の**すべての Route を自動で列挙**し、未ログインなら 401 になること、どんな入力でも 500 にならないことを確認している。新しい Route を `ROUTES` に加えないとテストが失敗するので、session の確認漏れは CI で止まる
- `docs/Review.md` のセキュリティ観点（session の確認、Cookie、秘密情報と実顧客情報の混入）

**対策**

| 順番 | 内容 |
|---|---|
| 1 | **Semgrep**（無料の Community Edition）を CI に追加する。TypeScript と Next.js 用のルールを使う。CodeQL は、非公開リポジトリだと有料になるので使わない |
| 2 | `docs/Review.md` のセキュリティ観点に「入力の長さ・件数の上限」「エラーのレスポンス・ログ・Slack に内部の情報や個人情報を出さない」「新しい入口（Route、外部サービス）を追加したら、`docs/SecurityPolicy.md` の §5 と §7 を更新する」を加える |
| 3 | 新しい Route を追加するときは、上のファジングのテストの `ROUTES` にも加える（加えないとテストが失敗する、という今の仕組みを維持する） |
| 4 | 予約 API の文字列と配列に、長さ・件数の上限を付ける（`src/lib/api/reservationSchemas.ts`）。Firestore の 1 MiB 上限の超過やデータの破損も防ぐ。既存データの最大長を測ってから、まず書き込み側にだけ入れる（読み取り側は上限を超えると空文字に置き換えるため）。上限は `src/constants/` に置く |
| 5 | 400 のレスポンスで返している Zod の詳細（`details: parsed.error.flatten()`）を、本番では返さないか、受容するかを決める |

### T8: 機密情報・宿泊客の実データの混入

| 順番 | 内容 |
|---|---|
| 1 | **gitleaks を CI に追加する**。PR の差分を検査し、導入時に一度だけ**全履歴**も検査する。GitHub の Push Protection は非公開リポジトリだと有料なので、その代わりにする |
| 2 | **テストデータは `seed` か `anonymize` から作る**。実データを `tests/`、`e2e/`、`docs/`、Issue、PR、AI エージェントへの指示に貼らない（`docs/Review.md` の観点と同じ） |
| 3 | **`anonymize`（本番の閲覧権限を借りる作業）の実行中は、AI エージェントを動かさない**。エージェントが本番のデータや権限に触れられる時間を作らない |
| 4 | Slack の Webhook を、平文の環境変数ではなく Secret Manager に置く（今は Cloud Run の画面で閲覧権限がある人なら誰でも見える） |
| 5 | リポジトリを公開に切り替える前に、gitleaks で全履歴を検査する |
| 6 | 漏れたときは §7 の手順に従う |

## 3. 実施計画

| 段階 | 内容 | 効く脅威 | 種類 |
|---|---|---|---|
| P0 | パスキー（T5-1）、IAM の確認（T5-2）、WIF の条件（T5-3）、新規登録が API レベルで無効かの確認、予算アラート、§4 で P0 とした項目 | T5、T1 | 設定 |
| P1 | T6-1〜9、T5-4・5・7、T7-1〜5、T8-1〜4、T1-1（IP 通知で観察を始める）、§4〜§9 で P1 とした項目（検知とアラート、検査、依存パッケージの管理の仕組みなど） | T1、T5、T6、T7、T8 | コードと設定 |
| P2 | 端末登録（T1-2） | T1、T3、T2（一部）、T4（一部） | コード |
| P3 | ログインのサーバー経由化、失敗回数の制限、パスワードの事前チェック（T1-3〜5。`firebase` パッケージの削除、API キーの作り直し、CSP と audit 例外の整理を含む） | T1 | コード |
| P4 | パスワードを作り直してから、パスワードポリシー（Require モード）を有効にする（T1-6） | T1 | 設定 |
| P5 | DBSC（T4） | T4、T3 の残るリスク | コード |
| P6 | Terraform による設定のコード化と、ずれの自動検知（§5）。P1 が終わったあとなら、いつ始めてもよい | T5、T6 | コード |

- 順番の理由は `docs/SecurityPolicy.md` §9 に書く。
- 設計（端末登録のスキーマ、登録コードの発行方法など）は、着手するときにこの文書に追記する。
- CI/CD を変更するときは、AGENTS.md のとおり `docs/CICD.md` も同時に更新する。

## 4. 設定の点検（チェックリスト）

リポジトリの外にある設定の確認項目。§2 の対策表にある項目（パスキー、WIF の条件、Cloud Run の専用サービスアカウント、Firestore Rules、SHA 固定の強制、Dependabot、ルールセット、Environment、Secret scanning など）は省略する。

| # | 確認項目 | 望ましい状態 | 効く脅威 | 段階 |
|---|---|---|---|---|
| F1 | ログイン方法 | メール/パスワードだけ有効。匿名ログインなど使わない方法は無効 | T1 | P0 |
| F2 | Firebase Auth のユーザー一覧 | PC の4アカウントだけ。テスト用や不要なアカウントがない | T3 | P0 |
| F3 | 承認済みドメイン | `localhost` など不要なドメインを外し、本番の `run.app` だけにする | T1 | P0 |
| F4 | メール列挙保護 | 有効（「そのメールアドレスは存在しない」と返さない） | T1 | P0 |
| F5 | Identity Platform のリクエストログ | 有効。Google に直接送られたログイン試行も Cloud Logging に残る（P3 でサーバー経由になるまでの、唯一の失敗記録） | T1 | P1 |
| G1 | 既定の Compute Engine サービスアカウント | Editor 権限を外す（使っていなければ無効化） | T6 | P1 |
| G2 | API キーの制限 | Identity Toolkit API と Token Service API だけを許可し、HTTP リファラーを本番ドメインに限定する（P3 でキーを作り直すまでの暫定措置） | T1 | P0 |
| G3 | デプロイ用サービスアカウントの権限 | Cloud Run のデプロイ、Artifact Registry への push、実行用サービスアカウントの指定（actAs）だけ | T5 | P0 |
| G4 | サービスアカウントの鍵 | 鍵ファイルが1つもない（WIF と ADC を使うので不要） | T5 | P0 |
| G5 | Cloud Run の最大インスタンス数 | 小さい値（例: 2〜3）にして、DDoS のときの請求額を抑える | `SecurityPolicy.md` §8 の DDoS | P1 |
| G6 | Artifact Registry | 脆弱性スキャンを有効にし、古いイメージを消すクリーンアップポリシーを設定する | T6 | P1 |
| H1 | `GITHUB_TOKEN` の既定の権限 | read-only | T6 | P0 |
| H2 | fork からの PR のワークフロー | 実行前に承認を必須にする | T6 | P0 |
| H3 | Collaborator、Deploy key、連携アプリ（GitHub Apps / OAuth Apps） | 不要なものがない | T5 | P0 |
| O1 | Slack の Webhook | 通知先のチャンネルが適切か。URL が漏れたら作り直す（§7） | T5 | P0 |

点検は四半期に1回行う。§5 の Terraform に取り込んだ項目は、自動のずれ検知に置き換える。

## 5. 設定のコード化（IaC）

コンソールでの手作業は、変更の記録が残らず、知らないうちに設定がずれる。設定をコードにして、次の効果を得る。

- 設定の変更が PR になり、レビューと履歴（いつ・何を）が残る
- コンソールで誰かが手で変えても、差分として検知できる
- 環境を作り直すときや、staging を作るときに同じ設定を再現できる（`docs/KnownIssues.md` の「staging 環境がない」にも効く）

| 段階 | 対象 | 方法 |
|---|---|---|
| 1（P1 に含まれる） | Firestore Rules、Cloud Run の設定（サービスアカウント、最大インスタンス数、secrets）、Dependabot、npm の設定、ZAP の除外ルール | リポジトリ内のファイル（`firestore.rules`、`deploy.yml` の flags、`.github/dependabot.yml`、`.npmrc`、ZAP の rules ファイル） |
| 2（P6） | GCP と Firebase（§4 の F・G、§2 の WIF・IAM・サービスアカウント、§6 のアラート、予算） | Terraform。既存のリソースは `import` ブロックで取り込む（作り直さない）。state はバージョニングを有効にした GCS バケットに置く |
| 3（任意） | GitHub の設定（ルールセット、Environment、Actions の権限など） | Terraform の `integrations/github` provider。項目が少ないので、四半期ごとの手作業の点検で済ませてもよい |

- **ずれの自動検知**: GitHub Actions で週1回、読み取り専用のサービスアカウントで `terraform plan -detailed-exitcode` を実行し、差分があれば通知する。
- Identity Platform の一部の項目（新規登録の無効化、メール列挙保護、リクエストログ）を Terraform provider がどこまで扱えるかは要確認。
- **コード化できないもの**: アカウント自体の 2FA / パスキー、Terraform の state バケットと Terraform 用アカウントの最初の作成、F2・G4 の「中身」の確認。

## 6. 検知とアラート

対策をすり抜けた攻撃や、設定の誤りに気付くための仕組み。通知が Slack だけだと、Slack の障害や Webhook の失敗に気付けないので、**重大なものはメールにも送る**。

| 検知すること | 方法 | 効く脅威 | 段階 |
|---|---|---|---|
| ログイン成功時の接続元 IP | `/api/auth/login` で Slack に通知する（T1-1） | T1、T2、T3 | P1 |
| Google 側でのログイン失敗 | F5 のログに、Cloud Logging のログベースのアラートを付ける。P3 以降は、自前のログと通知に置き換える | T1 | P1 |
| 5xx・想定外のエラーの急増 | ログベースのアラート | T6 | P1 |
| Slack 通知の失敗（今はログに出るだけで気付けない。`docs/KnownIssues.md`） | `Slack通知失敗` のログに、ログベースのアラートを付け、メールで通知する | 全般 | P1 |
| GCP の管理操作（IAM の変更、サービスアカウントの鍵の作成、Cloud Run の設定変更） | Cloud Audit Logs（管理アクティビティのログは既定で有効）にアラートを付ける | T5 | P1 |
| 予算の超過 | 予算アラート（メール） | `SecurityPolicy.md` §8 の DDoS | P0 |
| 依存パッケージの脆弱性、シークレットの漏えい | Dependabot と Secret scanning の通知をメールで受け取る | T5、T6 | P1 |

## 7. インシデント対応の手順

起きたときに迷わないよう、最初にやることを決めておく。

| 起きたこと | すぐやること |
|---|---|
| PC の紛失・盗難 | Firebase コンソールで、その PC のアカウントを無効にする（次の API 呼び出しから 401 になる）。端末登録を入れたあとは、その端末の登録も削除する。パスワードを作り直してから、アカウントを有効に戻す |
| パスワード漏えいの疑い（知らない IP からのログインの通知など） | 上と同じ。加えて、そのセッションで行われた操作をログで確認する |
| Slack の Webhook URL の漏えい | Slack で Webhook を作り直し、Secret Manager の値を更新する |
| 管理者アカウントの乗っ取りの疑い | パスワードとパスキーを再設定し、全セッションを無効にする。IAM、Cloud Audit Logs、GitHub の audit log で変更を確認する。WIF とデプロイを止め、直近にデプロイされたイメージを確認する |
| 秘密情報（API キー、Webhook の URL など）を commit・push した | ① **すぐにキーを無効化して作り直す**（最優先。履歴から消しても、すでに読まれていれば意味がない）② 使われた形跡がないかログを確認する ③ `git filter-repo` で履歴から消し、force push する ④ 宿泊客の個人情報だった場合は、下の「個人情報の漏えい」の手順に従う |
| 悪性パッケージを入れた疑い（axios の事例のようなもの） | lock ファイルと、デプロイごとの SBOM（§9）で、該当バージョンが入っていたか・いつ本番に出たかを確認する。開発 PC と CI の認証情報（GitHub のトークン、gcloud、npm）をすべて作り直す。該当パッケージを安全なバージョンに戻す |
| 個人情報の漏えい、またはそのおそれ | 不正アクセスによる漏えい（おそれを含む）は、件数にかかわらず個人情報保護委員会への報告と本人への通知が必要。速報は速やかに（目安3〜5日）、確報は30日以内（不正の目的によるものは60日以内）。宿泊客へ偽メッセージへの注意を呼びかける。必要なら Firestore の PITR で復元する（期限と手続きは、個人情報保護委員会の最新の手引きで要確認） |

## 8. 検査と継続的な点検

| 項目 | 内容 | 効く脅威 | 段階 |
|---|---|---|---|
| SAST | Semgrep を CI に追加する（T7-1） | T7 | P1 |
| 秘密情報の検査 | gitleaks を CI に追加する（T8-1） | T8 | P1 |
| ZAP の full scan | CI の中で起動したサーバーに対して実行する（本番には実行しない）。`docs/KnownIssues.md` の「full モードを試していない」への対応。ログイン後の画面の検査は、端末登録のあとに検討する | T6、T7 | P1 |
| ASVS 5.0 L1 の棚卸し | 年1回、`docs/SecurityPolicy.md`、この文書、実装を ASVS L1 の項目と突き合わせる | 全般 | 継続 |
| KnownIssues の古い記述 | 「CI が通らなくても deploy される」は、`deploy.yml` の `conclusion == 'success'` で解消済みの可能性がある。確認して更新する | — | P1 |

## 9. 依存パッケージの管理

方針は `docs/SecurityPolicy.md` §10 に書く。ここには、その手順を書く。

### 9.1 現状（2026-11-01 時点）

| 項目 | 状態 |
|---|---|
| パッケージの数（lock ファイル上） | 808（本番用 367、開発用 441）。直接の依存は本番用 15、開発用 14 |
| 署名と provenance | `npm audit signatures` で、714 パッケージのレジストリ署名と、149 パッケージの attestation（provenance）を確認できた |
| install script を持つもの | `@firebase/util`（ブラウザ用 `firebase` から。Firebase Hosting 用の既定設定を書き出す処理で、このアプリでは不要）、`protobufjs`（`firebase-admin` から。バージョン表記の警告を出すだけ）、`esbuild`・`unrs-resolver`（開発用。バイナリの取得や確認）、`fsevents`（開発用、macOS のみ） |
| 既知の脆弱性の例外 | `@grpc/grpc-js` の high（`scripts/ci/auditAllowlist.ts`）。`firebase-admin` 経由の low 8件（`docs/KnownIssues.md`） |
| バージョンのずれ | `@types/node` が `^20`（Node 24 への更新時に合わせる）。`eslint-config-next` が 16.2.1 で、`next`（16.4.3）とずれている |
| 自動更新 | なし（Dependabot が未設定） |

### 9.2 追加するときの確認

新しい依存を入れる PR には、次を確認した結果を書く。

| 確認すること | 基準 |
|---|---|
| 本当に必要か | 標準 API（Web API、Node.js）や、すでに入っている依存で代わりにできないか。数十行で書ける小さな処理なら自分で書く。ただし暗号・認証・入力のパースなど、間違えると危険なものは自作しない |
| メンテナンスの状態 | 最近もリリースがあるか。メンテナが1人だけではないか。利用者が十分に多いか |
| 発行元の確かさ | provenance（attestation）付きで公開されているか |
| install script | あるなら、何をするかを読む。不要なら `ignore-scripts` のまま使えるか確かめる |
| 連れてくる依存の数 | lock ファイルの差分で、増えるパッケージの数を確認する |
| 置き場所 | テストやビルドにしか使わないものは `devDependencies` に入れる（本番のイメージに入れない） |
| ライセンス | 商用利用できるもの（MIT、Apache-2.0、BSD など） |

### 9.3 更新の手順

| 種類 | 手順 |
|---|---|
| 脆弱性の修正 | `docs/SecurityPolicy.md` §10 の期限で更新する。実行されないものは `scripts/ci/auditAllowlist.ts` に理由と期限（最長3か月）を書く |
| 通常の更新（minor / patch） | Dependabot で週1回、まとめて PR にする（`groups`）。公開から7日たったものだけを対象にする（`cooldown`。セキュリティ更新には適用されないので、修正は遅れない） |
| major の更新 | 1パッケージずつ別の PR にする。Context7 で移行ガイドを確認する（AGENTS.md） |
| React / Next.js | 公式のセキュリティ情報（Next.js の GitHub advisories、React のブログ）を見る。RSC と proxy は、繰り返し脆弱性が出ている場所 |

更新の PR では、CI が通ることに加えて **lock ファイルの差分**を見る。知らないパッケージが増えていないか、install script を持つものが増えていないか、`resolved` が `registry.npmjs.org` 以外を指していないかを確認する。

### 9.4 インストールの防御

| 対策 | 内容 |
|---|---|
| lock ファイルどおりに入れる | CI と Docker では `npm ci` だけを使う（今もそうなっている）。`npm install` は依存を変えるときだけ使う |
| `.npmrc` をリポジトリに置く | `ignore-scripts=true` と `min-release-age=7`。npm 11.10 以降が必要（Node 24 への更新とあわせて npm も更新する） |
| `ignore-scripts` の確認 | 導入前に `npm ci --ignore-scripts` のあと、lint、型チェック、unit、emulator、E2E、build がすべて通ることを確かめる。9.1 の install script は、このアプリでは不要か代わりの仕組みがある見込みだが、実際に確認する |
| Docker build | 今の Dockerfile は、依存を入れる段階で `package.json` と `package-lock.json` しかコピーしていない。**`.npmrc` もコピーしないと、イメージのビルドでは設定が効かない** |
| 署名の検証 | CI に `npm audit signatures` を追加する。署名が不正なパッケージがあれば失敗させる |
| 開発 PC | リポジトリの `.npmrc` は、このリポジトリの中だけで効く。ほかのプロジェクトも含めて守るなら、`~/.npmrc` にも同じ設定を書く。バージョンを指定しない `npx <パッケージ>` は使わない |

### 9.5 実行環境とベースイメージ

- Node.js は 24 LTS にする（Dockerfile、CI、`@types/node`）。
- Docker のベースイメージ（`node:24-alpine`）は digest で固定し、Dependabot（`docker`）で更新する。
- 本番のイメージには `standalone` の出力だけを入れる（今もそうなっている。開発用の依存はイメージに入らない）。

### 9.6 GitHub Actions

- アクションも依存の一つとして扱う。コミット SHA に固定し（T6-6）、Dependabot（`github-actions`）で更新する。
- できるだけ GitHub や Google などの公式のアクションを使う。サードパーティのアクション（今は `zaproxy/action-baseline`）は、更新の PR で差分を見てから取り込む。

### 9.7 SBOM（部品表）

- デプロイのたびに、`npm sbom --sbom-format cyclonedx` で SBOM を作り、GitHub Actions の artifact として残す。
- 「乗っ取られたバージョンが本番に入っていたか」に、すぐ答えられるようにするため（§7）。

### 9.8 減らす候補

| 依存 | 方針 |
|---|---|
| `firebase`（ブラウザ用） | ログインのサーバー経由化（P3）で削除する。`@grpc/grpc-js` の例外と、`@firebase/util` の install script もなくなる |
| `eslint-config-next` | `next` とバージョンを合わせる |
| そのほか | 四半期の点検（§4）のときに、使っていない依存がないか確認する |

## 10. 検討して採用しなかった・保留した対策

| 対策 | 判断 | 理由 | 見直す条件 |
|---|---|---|---|
| ログアウトボタン | 採用しない | スタッフ専用の PC で使う。緊急時はアカウントを無効にすれば、セッションも失効する（§7） | 不特定の人が触れる場所に PC を置くとき |
| IAP（Google アカウントによる前段の認証） | 保留 | Edge でも使う。スタッフ用の Google アカウントの運用が必要になる | 端末登録が運用に合わないとき。スタッフごとのアカウントを作るとき |
| 異常時のアカウント自動無効化 | 保留 | 端末登録で未登録の端末を拒否できるので、追加の効果が小さい | 端末登録のあとも、不審なログインが観察されたとき |
| Trusted Types | 保留 | React が自動でエスケープし、`dangerouslySetInnerHTML` も使っていないので効果が小さい。Next.js / MUI / Firebase が動かなくなるおそれがある | HTML を直接扱う機能を追加するとき。試すときは Report-Only から始める |
| CodeQL、GitHub の Push Protection | 採用しない | 非公開リポジトリでは有料。Semgrep と gitleaks で代わりにする | リポジトリを公開するとき（どちらも無料になる） |
| `eslint-plugin-security` | 採用しない | TypeScript では誤検知が多く、Semgrep と役割が重なる | Semgrep で足りない検査が出てきたとき |
| gitleaks を commit 前のフックでも動かす | 任意 | CI で止められる。非公開リポジトリなので、push から CI までの間に読まれるおそれは小さい。フックのために npm の依存（husky など）を増やしたくない | 開発者が増えたとき。リポジトリを公開するとき |
| gitleaks に、個人情報を見つけるための独自ルールを入れる | 採用しない | 氏名などはパターンで見つけられず、テストデータで誤検知が増える。実データの混入はルール（T8-2）とレビューで防ぐ | 予約番号など、形式が決まっている実データを扱うとき |
| HSTS preload | 不要 | `*.run.app` は `.app` ドメインごと preload 済み | 独自ドメインに移るとき |
| MFA | 不要（`docs/SecurityPolicy.md` §8） | 端末登録で代わりにする | `docs/SecurityPolicy.md` §8 のとおり |
