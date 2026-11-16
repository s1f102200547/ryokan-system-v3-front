# SMS の MFA まわりのバグ探し（記録）

[MfaBugHunt.md](MfaBugHunt.md) の各ステップで見つけたもの。**S19 まで直さない。** 判断の欄は S19 で埋める。
本番の値（プロジェクト ID、メールアドレス、電話番号、キー、IP）は書かない。

## 書き方

- ID: `F-01` から順に。再現テストの名前の先頭にも付ける
- 種類: バグ / 仕様の穴（どちらが正しいか決まっていない）/ 設定（クラウド）/ 気になる点
- 重さ: 高（ログインできない・守りが抜ける）/ 中（業務が止まりうる・料金）/ 低（表示・使いにくさ）
- 再現: テストのファイル:テスト名、または手順

## 一覧

| ID | ステップ | 種類 | 重さ | 現象 | 再現 | 期待 | 原因の見当 | 判断（S19） |
|---|---|---|---|---|---|---|---|---|
| F-01 | S1 | 仕様の穴 | 中 | reCAPTCHA で断られたとき・Firebase が送信を止めたとき・`start` の障害のときも、SMS の1日の通数を1つ消費する。D の `/api/auth/login` は `recaptcha_failed` を「数えない」、「SMS が10通を超えたら」と書く一方、D の `mfaSmsQuota` と `domain/auth/smsQuota.ts` は「送る前に1つ足し、送れなかった分も戻さない」と書く。読み込み直しを繰り返すと、SMS が届かないまま上限に達しうる | `src/application/auth/startMfaCommand.ts:36`（`consume` が `startPhoneMfa` より前）。MC:98 は通数を見ていない。S3: `tests/integration/api/auth/login/decisionTable.test.ts` の「Firebase が SMS を止めた」「reCAPTCHA の token を断られた」「SMS の送信の障害」の3行で、どれも通数が1つ減ることを確かめた（表では '未定' にして確かめていない） | 未定（「SMS の上限」が数えるのは送れた SMS か、試みか） | 同時の送信で上限を超えないよう、送る前に数える設計 | |
| F-02 | S1 | 仕様の穴 | 中 | コードが合った後に ID トークンの確認（障害）か Session Cookie の作成で 503 になると、途中の状態はもう消えていて、パスワードからやり直しになる（SMS をもう1通使う）。仕様に書かれていない。画面はコードの段のまま「サービスが一時的に…」と出し、打ち直しても `mfa_expired` になる | `src/application/auth/verifyMfaCodeCommand.ts`（成功で `deleteQuietly`）→ `src/app/api/auth/login/verify/route.ts`（その後で `verifyLoginIdToken`・`issueSession`）。S4: `tests/integration/api/auth/login/verify/decisionTable.test.ts` の「ID トークンの確認の障害」「Session Cookie を作れない」の行で、503 のとき途中の状態は消え、`mfa_pending` の Cookie は消さずに残ることを確かめた（ブラウザは使えない Cookie を持ったまま、コードの段に留まる） | 未定（503 の後の画面の段と、途中の状態を残すか） | Firebase 側でもコードは使い終わっている | |
| F-03 | S1 | 仕様の穴 | 中 | 「パスワードのときと同じ接続元」は、`X-Forwarded-For` の右端の文字列の完全一致。最大5分の間に IPv4 と IPv6 が切り替わる、IPv6 の一時アドレスが変わる、Wi-Fi やモバイル回線に変わると、`mfa_expired` と Slack の `[ログイン拒否]` になる。どこまでを同じ接続元とみなすかは決まっていない。本番での頻度も分からない | `src/domain/auth/mfaPending.ts:19`（`pending.ip !== ip`） | 未定。頻度は S17・S18 で見る | — | |
| F-04 | S1 | 仕様の穴 | 中 | `enrolled_only` を終える仕組みが手順書だけにある（期限・通知・デプロイでの確認がない）。また `enrolled_only` の間に `--remove` で電話を外したアカウントは、パスワードだけで入れる。V の `--remove` の説明「解除（ログインできなくなる）」は `all` のときだけ正しい | `src/lib/auth/mfaMode.ts`、`.github/workflows/deploy.yml`（値の形だけ確かめる）、`docs/Development.md` の `mfa:enroll` の例 | 未定（期限を持たせるか、`--remove` の説明を直すか） | — | |
| F-05 | S1 | 仕様の穴（バグの疑い） | 中 | reCAPTCHA の script の読み込みには10秒の期限があるが、読み込んだ後の `ready` と `execute` には期限がない。どちらかが返らないと、ボタンが「ログイン中…」のまま戻らない（R28 の仕様は「読み込めなければ」だけ） | `src/hooks/auth/recaptchaEnterprise.ts:53`（`ready` の中の `execute` に期限がない）。動きの確認は S7・S14 | 一定の時間で理由を出して押せる状態に戻る（と思われる） | — | |
| F-06 | S1 | ドキュメント | 低 | N・D・S は「失敗の回数は SMS のコードが合ったときだけ0に戻す」と書くが、`enrolled_only` で SMS なしのログインが成功したときも0に戻す（コードと R1:165 は戻す）。例外が書かれていない | `src/application/auth/loginWithPasswordCommand.ts`（`completed`）、`docs/NormalOperation.md`、`docs/Domain.md` の `loginThrottle`、`docs/Security.md` | ドキュメントに例外を書く | — | |
| F-07 | S3 | 仕様の穴 | 低 | `enrolled_only` で電話を登録していないアカウントは、パスワードが合った時点で失敗の回数を0に戻す。その後に端末で断った（403 `client_not_allowed`）とき、ID トークンが無効（401 `login_failed`）のとき、ID トークンの確認や Session Cookie の作成が障害（503）のときも0に戻る。ログインは成功していない。`all` なら同じ場面は「数えない」（回数はそのまま） | `decisionTable.test.ts` の「enrolled_only: MFA なし・Linux」「トークンが無効」「トークンの確認の障害」「Session Cookie を作れない」の4行（表では '未定'）。原因は `src/application/auth/loginWithPasswordCommand.ts` の `completed`（Cookie を出す前に success を記録する） | 未定（0に戻すのは Session Cookie を出せたときだけにするか）。パスワードを知る者にしか起きない。S4: verify も同じ形で、コードが合えば、その後に ID トークンが無効・2要素目なし・端末で断った・503 でも0に戻す（`verify/decisionTable.test.ts`。こちらは仕様「コードが合ったときに0」どおり）。直すなら両方をそろえる | 回数の確定が、Route の後の手順を待たない | |
| F-08 | S3 | 気になる点 | 低 | ログイン API の 5xx の本文が、経路で2通りある: `handleRouteError` は `internal server error`（Firestore・Identity Toolkit の障害。InfraError のコードによって 500 か 503）、ID トークンの確認と Session Cookie の作成は `server error`（503）。画面は本文を読まず同じ文言を出す（AGENTS.md「ログイン画面では 500 と 503 を出し分けない」）ので、利用者には影響しない。API の status と本文で、どこが壊れたかを外から見分けられる | `decisionTable.test.ts` の「パスワードの確認の障害」「SMS の送信の障害」と「enrolled_only: … 障害」の行 | 未定（そろえるか） | — | |
| F-09 | S3 | 気になる点 | 低 | SMS を送った後に途中の状態を保存できない（Firestore の障害）と 503 になる。SMS は届くが、コードを使う途中の状態がないので、パスワードからやり直す（もう1通使う） | `src/application/auth/startMfaCommand.ts:53-56`、R1 の「途中の状態の保存 の障害は 503」 | 未定（F-02 と同じ種類。まれな障害） | 送ってから保存する順番 | |

## 網羅率（S2）

2026-11-16。`npm run coverage:auth`（unit・integration・PBT・fuzz）と `npm run coverage:auth:emulator` の分岐を合わせ、**どちらのテストでも通っていない分岐**だけを載せる。E2E（Playwright）は測っていない。
unit だけの値: 分岐 85.6%（482/563）。Emulator だけの値: 61.7%（235/381）。合わせると、下の表の分岐を除いてすべて通っている。

| ファイル | 分岐（合わせて） | 通っていない分岐 | 埋めるステップ |
|---|---|---|---|
| `src/app/api/auth/login/route.ts` | 34/35 → 35/35（S3） | ~~103: `enrolled_only` の SMS なしログインで、ID トークンの確認が障害（503）~~ S3 の表で通した | S3 |
| `src/app/api/auth/login/verify/route.ts` | 29/32 → 32/32（S4） | ~~53: verify の 429 `attempt_in_progress` / 75・82: トークンに email がないときの Slack の宛先~~ S4 の表で通した | S4 |
| `src/application/auth/verifyMfaCodeCommand.ts` | 11/14 → 14/14（S4） | ~~62: Firebase が止め、こちらも止め始めた / 71: 途中の状態を消せなかったとき~~ S4 の表で通した | S4 |
| `src/application/auth/loginAttempt.ts` | 13/14 | 55: 回数の記録の失敗が InfraError でないとき | S9 |
| `src/hooks/auth/recaptchaEnterprise.ts` | 0/4 | すべて（unit なし。`e2e/prod/recaptcha.spec.ts` が読み込みの成功と失敗だけを通る）。読み込み済みの `grecaptcha` の再利用、`enterprise` がない、`ready`・`execute` が返らない（F-05） | S7、S14 |
| `src/components/auth/LoginForm.tsx` | 0/26 | すべて（unit なし。E2E だけ） | S7、S14 |
| `src/components/auth/MfaCodeInput.tsx` | 34/39 | 105: `onSelect` でカーソルを末尾に戻す（jsdom では起きない） | S14 |
| `src/hooks/auth/useLogin.ts` | 91/93 | 120: `phoneHint` が空・文字列でない / 251: 自動の送り直しで `retryAfterSeconds` がない | S5 |
| `src/hooks/auth/fetchWithSession.ts` | 13/14 | 10: サーバー側で呼ばれたとき | 対象外（使われ方の確認だけ S11） |
| `src/infra/auth/firestoreLoginThrottleRepository.ts` | 21/24 | 70・78・98: key が0個 | 対象外（`throttleKeys` は必ず2個） |
| `src/infra/auth/firestoreSmsQuotaRepository.ts` | 3/4 | 27: 形の崩れた `mfaSmsQuota` のドキュメント | S9 |
| `src/infra/auth/identityToolkit.ts` | 16/18 | 35: エラーの文が空 / 47: 5桁以下の数字の並びを伏せずに残す | S10 |
| `src/infra/auth/passwordSignIn.ts` | 15/16 | 54: `phoneInfo` のない MFA の応答 | S9 |
| `src/domain/auth/loginThrottle.ts` | 51/52 | 89: `acquireAll` で一部の key だけ断られた | S8 |
| `src/lib/api/routeHelpers.ts` | 17/18 | 48: Error でない例外の記録 | S10 |
| `src/lib/auth/loginNotice.ts` | 23/24 | 83: IP の制限の通知で、IP の形でない値 | S10 |
| `src/lib/auth/verifySession.ts` | 16/17 | 18: オブジェクトでない例外 | S10 |

ほかの対象（`startMfaCommand.ts`・`loginWithPasswordCommand.ts`・`mfaSignIn.ts`・`mfaPending.ts`・`smsQuota.ts`・`loginSession.ts`・`businessHours.ts` など）は、分岐をすべて通っている。
