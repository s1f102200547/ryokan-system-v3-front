# SMS の MFA まわりのバグ探し（手順）

2026-11-11〜11-15 の変更（SMS の2要素目、reCAPTCHA、`MFA_MODE`、API の時間帯制限、コードの入力欄、再送の待ち）のバグを探す。
見つけたものは [MfaBugHuntFindings.md](MfaBugHuntFindings.md) に記録し、**全ステップが終わるまで製品のコード（`src/`）は直さない**。直すかどうか・どう直すかは最後のステップ（S19）で決める。

## 決まり

- 1ステップ = 1コミット。Claude Code がステップを実行 → 開発者が差分を確認してコミット → 次へ
- 足すのはテスト・スクリプト・ドキュメントだけ。`src/` は変えない（S13 の計測も外から測る）
- バグを再現したテストは、落ちる形のまま `it.fails`（Vitest）/ `test.fail()`（Playwright）で残し、名前の先頭に記録の ID（`[F-03]` など）を付ける。CI は通り、直したら外す
- 仕様が決まっていないもの（どちらが正しいか分からない）は、テストを書かずに「仕様の穴」として記録する
- 各ステップの最後に `npm run lint`、`npx tsc --noEmit`、`npm run test -- --run`。Emulator・E2E に触れたステップは、そのコマンドも実行する
- Claude Code は本番（GCP・本物の Firebase・本物の SMS）に触れない。本番が要るステップ（S15〜S18）は、Claude Code が手順と道具を用意し、開発者が実行する
- `make` の Emulator と開発サーバーを使うステップ（S14）の前後で、ポートの衝突に注意する（`test:emulator`・`e2e:emulator` と同時に動かさない）

## 手順

| # | 技法 | 対象（§は下の「対象」） | やること | 成果物 |
|---|---|---|---|---|
| S0 | — | — | ブランチ `feature/mfa-bug-hunt`、この手順、記録の表 | この2ファイル |
| S1 | 要求仕様のテスト | 全体 | Domain.md・Development.md・Security.md・`src/constants/auth.ts` のコメントから、MFA の仕様文を1行ずつ書き出し、対応するテスト（ファイル:テスト名）を紐づける。対応のない仕様と、決まっていない仕様（例: reCAPTCHA で断られた分を1日の通数に数えるか）を記録する | `docs/MfaSpecTrace.md`、記録 |
| S2 | ホワイトボックス | 3, 7, 8 | `@vitest/coverage-v8` を入れ（版を固定。入れてよいかは開発者に聞く）、`src/app/api/auth/**`・`src/application/auth/**`・`src/infra/auth/**`・`src/domain/auth/**`・`src/hooks/auth/**`・`src/components/auth/**`・`src/lib/auth/**` の分岐の網羅率を測る。通っていない分岐を一覧にする（テストはまだ足さない。S3〜S12 で埋める） | 網羅率の表（記録の末尾）、`package.json` |
| S3 | デシジョンテーブル | 3, 4 | `/api/auth/login`: `MFA_MODE`（all / enrolled_only / 未設定 / 想定外）× 電話の登録 × 端末 × パスワード × 通数 × `start` の結果（ok / throttled / recaptcha_rejected / 未知）× token（有 / null）。期待値は status・error・**通数を消費したか**・回数の結果（success / void / failure）・Cookie・Slack。`it.each` で表のまま書く | `tests/integration/api/auth/login/decisionTable.test.ts` |
| S4 | デシジョンテーブル | 5, 8 | `/api/auth/login/verify`: Cookie（なし / 期限切れ / IP 違い / ok）× コードの結果（正 / 誤 / 期限切れ / throttled / 未知）× トークン（有効 / 無効 / 障害）× 2要素目（phone / なし）× 端末 × `issueSession`（成功 / 失敗）。期待値は status・error・途中の状態を消したか・Cookie・Slack | `tests/integration/api/auth/login/verify/decisionTable.test.ts` |
| S5 | 境界値 | 3, 6, 10 | 純粋関数と定数の境界: 通数 9 / 10 / 11 回目（`firstRejection` は10回目だけ）、途中の状態の期限ちょうど / 1ms 前、ロックの失敗 2〜7 回・24時間で0に戻る境目、コード 5 / 6 / 7 桁・全角、token 4096 / 4097 文字、サイトキー 19 / 20 / 100 / 101 文字、`useLogin` の再送の待ち 29.999 秒 / 30 秒 | `tests/unit/` の各ファイルに足す |
| S6 | 境界値（時刻） | 9, 12 | 5:59 / 6:00 / 22:54 / 22:55（Cookie の最低5分）/ 22:59 にパスワード → 23:00 に verify / 23:04 / 23:05。ログイン API・verify API・`requireSession`・`proxy.ts`・`fetchWithSession` の組で、画面と API の扱いが食い違わないか | `tests/time/mfaBoundaries.test.ts` |
| S7 | 状態遷移（画面） | 7, 11 | `useLogin` の状態表（credentials / code / 確認中 / 止められている / 再送の待ち）と遷移を docs に書き、全遷移と不正な遷移（確認中の再送、止められている間の verify、戻った直後の再送、6桁が2回そろう）をテストする | `docs/MfaSpecTrace.md` に表、`tests/unit/hooks/useLogin.stateMachine.test.ts` |
| S8 | 状態遷移（サーバー） | 5, 6, 8 | Emulator で: 同じ Cookie で verify を2回、戻ってから古い Cookie で verify、パスワードを2回通した後に1回目の Cookie で verify、**同じ IP の別アカウント**の失敗で止まるか、コードの成功で IP の回数も0に戻るか、`enrolled_only` で電話を外したアカウント | `tests/emulator/mfaStateTransitions.test.ts` |
| S9 | モジュール思考 | 6, 8 | port の契約テスト: 同じテストを memory の実装（`tests/utils/memoryMfaRepositories.ts`）と Firestore の実装の両方に流す（期限・同時の `consume`・形の崩れたドキュメント）。`identityToolkit` の応答（エラー文の形、JSON でない、空）を固定値で並べ、分類を確かめる | `tests/utils/contracts/`、`tests/emulator/mfaContracts.test.ts`、`tests/unit/infra/auth/` |
| S10 | ファジング・PBT | 5, 10, セキュリティ | `routes.fuzz` に verify の body・`mfa_pending` Cookie（巨大・制御文字・`=`）・`X-Forwarded-For`（複数・IPv6・空・不正）を足す（5xx と Slack にならないこと）。PBT: `describeError` の出力に6桁以上の数字・32文字以上の英数字が残らない。`sanitizeMfaCodeInput` は出力が `[0-9]{0,6}` で、2回かけても同じ。`forwardedIps` | `tests/integration/fuzz/`、`tests/pbt/auth.pbt.test.ts` |
| S11 | アーキテクチャバリデーション | 4, 12 | import を走査: 層の依存（AGENTS.md の表）、`src/` から `firebase` を使わない、`auth/login*` 以外の全 Route が `requireSession` を呼ぶ、ログイン必須の hook が `fetch` を直接使わない。MFA の定数（桁数・長さ）が UI と Zod で同じ値か | `tests/unit/config/architecture.test.ts` |
| S12 | セキュリティテスト | 5, 6 | Emulator・E2E で: パスワードの段を飛ばした verify、2要素目を通っていないトークン、存在しないメールアドレスと間違ったパスワードで応答（status・本文・時間）が同じか、`mfa_pending` Cookie の属性（path・HttpOnly・SameSite・Max-Age）、`/login` だけ Google を許す CSP と COEP | `tests/emulator/`、`e2e/emulator/`、`e2e/prod/` |
| S13 | パフォーマンスベンチマーク・回帰 | 1, 6 | Emulator で、ログイン1回の時間（パスワード → コード → Cookie）を外から10回測る。**同じ IP から5アカウントが同時にログイン**し、`attempt_in_progress` の自動再試行（5回）を使い切らずに全員が通るか。結果は基準として JSON に残す（合否なし、CI に入れない）。チューニングは S19 の後 | `e2e/perf/mfaLogin.perf.spec.ts`、`perf-results/` |
| S14 | 探索的テスト（Claude Code） | 7, 10, 11 | 下の「探索的テストのやり方」 | 記録、見つかったものの回帰テスト（`it.fails`） |
| S15 | Prowler（開発者が実行） | §4 | Claude Code: 読み取り専用の SA の作り方（`roles/viewer`・`roles/iam.securityReviewer`）、実行コマンド、mutelist の置き場所を書く。開発者: `prowler gcp` を本番に実行し、結果の要約（ID と件数だけ。プロジェクトの値は伏せる）を記録に貼る。IAM Recommender（`gcloud recommender recommendations list`）も一緒に | `docs/MfaBugHunt.md` に手順、`.prowler/mutelist.yaml`、記録 |
| S16 | 設定スナップショット（開発者が実行） | §4 | Claude Code: 読み取り専用で次を読み、期待値の JSON と比べるスクリプトを書く: Identity Platform の config（mfa・`smsRegionConfig`・`authorizedDomains`・新規登録の禁止・`recaptchaConfig` の点数と ENFORCE）、reCAPTCHA キーの許可ドメイン、API キーの制限、Firestore の TTL、実行用 SA のロール、予算アラート。開発者: 本番に実行し、差分を記録に貼る | `scripts/ci/cloudConfigCheck.ts`、`scripts/ci/cloudConfigExpected.json` |
| S17 | ペネトレーション（開発者が実行） | 5, 6 | 利用時間内に、開発用アカウントで本番に対して: ① 偽の `X-Forwarded-For` を付けて送り、Cloud Logging の `forwardedIps` の右端が変わらないか（「右端 = Google が書いた接続元」の前提）。② 回数制限の表から1日に試せるコードの回数を計算し、2〜3回の実測で表どおりに止まるか。SMS の料金がかかるので回数を先に決める | 手順（この md）、記録 |
| S18 | アクセプタンス・パフォーマンスモニタ（開発者が実行） | 1, 2, 5, 10 | `enrolled_only` のまま、スタッフの PC を1台ずつ登録して確かめる。合格条件: 各 PC で成功、4〜5台の同時ログインで全台60秒以内、Wi-Fi の切り替え、コードを3回間違える、再送、日本語入力、22:58 のログイン。間の数日、Cloud Logging で `sms_throttled`・`recaptcha_rejected`・`ip_mismatch`・未知のコードの 503・`sms_limit` の件数と、`sms_tf_risk_scores` を見る（クエリは Claude Code が用意する） | チェックリスト、記録 |
| S19 | トリアージ | — | 記録を全部見て、ID ごとに「直す / 直さない（理由）/ 仕様を決める」と、直し方・優先度・直すステップの分け方を決める。修正のステップは、この表の下に足す | 記録の「判断」欄 |

## 修正のステップ（S19 の後）

S19 の判断（[MfaBugHuntFindings.md](MfaBugHuntFindings.md) の「判断」欄）に従って直す。ブランチ `feature/mfa-bug-fix`、1ステップ = 1コミット。直したら、その ID の `it.fails` / `test.fail()` を外す。
F-04 は却下。F-03・F-15・F-19 は S17・S18 の後に決める。F-09・F-13 は直さない。

| # | ID | やること |
|---|---|---|
| R1 | F-21 | ログインの2つの API で `Content-Type: application/json` と `Sec-Fetch-Site: same-origin` を求める（合わなければ 403。Slack なし） |
| R2 | F-20 | 止め始めた試行（パスワード・コードの誤り）の応答で、401 ではなく 429 と残りの時間を返す |
| R3 | F-12・F-11 | `useLogin` の送信中を ref で持ち、`login`・`verify`・`resend` で二重に送らない |
| R4 | F-05 | reCAPTCHA の `ready`・`execute` と、token の作成全体に期限を付ける |
| R5 | F-14 | 再送の後に「新しく届いた SMS のコードを」と知らせる |
| R6 | F-18 | `MFA_MODE=all` のとき、`verifySession` で2要素目のない Session Cookie を断る |
| R7 | F-01 | 送れなかった SMS（reCAPTCHA で断られた・Firebase が止めた・送信の障害）を1日の通数に戻す |
| R8 | F-10 | 22:55 以降はログインの1段目を断る（SMS を送らない） |
| R9 | F-02 | コードを使い終わった後の 503 で途中の状態の Cookie を消し、画面をパスワードの段に戻す |
| R10 | F-07 | 失敗の回数を0に戻すのは、Session Cookie を出せたときだけにする |
| R11 | F-16 | `describeError` を NFKC にしてから伏せ、区切りに `.` `(` `)` を加える |
| R12 | F-08 | ログイン API の 5xx の本文を `internal server error` にそろえる |
| R13 | F-06・F-17 | ドキュメントを直す（回数を0に戻す例外、AGENTS.md の層の例外） |

## 対象（docs の対象番号）

§3（コードの動き）: 1 朝の同時 SMS が止められる / 2 reCAPTCHA の点数・未知のコード / 3 拒否でも SMS の通数を消費 / 4 `enrolled_only` のまま放置 / 5 `ip_mismatch` / 6 IP 単位の回数を全 PC で共有 / 7 reCAPTCHA の読み込みが終わらない / 8 コードの成功後に 503 / 9 23:00 の境界 / 10 コードの入力欄（日本語入力）/ 11 再送 / 12 API の時間帯制限 / 13 依存の一括更新
§4（クラウド）: 承認済みドメイン、reCAPTCHA キーの許可ドメイン、SMS の地域、MFA の有効化・新規登録の禁止、SMS defense の ENFORCE・点数、API キーの制限・スパイク用のキー、実行用 SA の権限、個人の ADC・使っていない SA、Firestore の TTL、予算アラート

## 探索的テストのやり方（S14、Claude Code）

**環境**: `make` の Emulator と開発サーバー（`http://127.0.0.1:3000`）。ブラウザは、scratchpad に置いた使い捨ての Playwright のスクリプトで Chromium を動かす（User-Agent は Windows の Chrome にする。`checkClient` が断るため）。SMS のコードは `make mfa-code`。API だけを試すときは curl。

**できないこと**（S18 で開発者が見る）: 本物の日本語入力（Microsoft IME・Google 日本語入力）、SMS の自動入力（`one-time-code`）、本物の reCAPTCHA の点数、本物の回線の IP の揺れ。日本語入力は CDP の `Input.imeSetComposition`・`Input.insertText` で近いものを作るだけ。

**進め方**: テーマごとに時間を区切る（1テーマ15〜30分）。操作・期待・実際を記録に残す。バグらしいものは、最小の再現を `e2e/` か `tests/unit/` に `test.fail()` / `it.fails` で残す。

| テーマ | 試すこと |
|---|---|
| コードの入力 | 全角数字、変換途中の確定（`imeSetComposition` → `insertText`）、`123 456`・`123-456` の貼り付け、7桁の貼り付け、英字、Backspace で全部消してから打ち直す、6桁がそろった直後にもう1文字、Enter を2回 |
| 二重送信・競合 | 6桁がそろうのと Enter が同時、確認中に再送、確認中に戻る、ログインを素早く2回押す、タブを2つ開いて別々に進める |
| 期限と戻り | 5分待ってから verify（Emulator の時計は進めず、Firestore の `mfaPending` の `expireAt` を書き換える）、戻る → 別アカウント → 古い画面に戻る、再読み込み（再送の待ちが0に戻る） |
| reCAPTCHA | 本番の設定に近づけるため `RECAPTCHA_SITE_KEY` に形の合う偽の値を入れて開発サーバーを起動し、`page.route` で google.com を遮断 / 遅延（20秒）/ `ready` が呼ばれない偽の script に差し替える。ボタンが戻るか、メッセージ |
| 止められている状態 | コードを3回間違える、パスワード2回 + コード1回、待ち時間の表示と解除、再読み込みした後の表示 |
| 時間帯 | `tests/time` で足りない組だけ: 開発サーバーを `NODE_ENV=production` 相当にはできないので、API に直接送って 403 の本文と、`fetchWithSession` の転送を見る |
| API を直接 | curl で: Cookie なしの verify、壊れた Cookie、`X-Forwarded-For` を変えてのパスワード → verify、同時に5本のログイン |

## 本番で確かめる手順の注意（S15〜S18）

- 開発者が実行する。Claude Code は結果の要約（ID・件数・コード名）だけを受け取り、プロジェクト ID・メールアドレス・電話番号・キー・IP は会話にも記録にも書かない
- 本番は 6:00〜23:00 にしか使えない。SMS は1通ずつ料金がかかり、1アカウント1日10通まで
