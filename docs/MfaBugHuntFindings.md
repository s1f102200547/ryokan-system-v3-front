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
| F-03 | S1 | 仕様の穴 | 中 | 「パスワードのときと同じ接続元」は、`X-Forwarded-For` の右端の文字列の完全一致。最大5分の間に IPv4 と IPv6 が切り替わる、IPv6 の一時アドレスが変わる、Wi-Fi やモバイル回線に変わると、`mfa_expired` と Slack の `[ログイン拒否]` になる。どこまでを同じ接続元とみなすかは決まっていない。本番での頻度も分からない | `src/domain/auth/mfaPending.ts:19`（`pending.ip !== ip`）。S10: `tests/integration/fuzz/mfaHeaders.fuzz.test.ts` で、同じ IPv4 を IPv4 射影の IPv6（`::ffff:203.0.113.5`）で書いたものも別の接続元になる（大文字・小文字は IPv4 では関係ない）。Google のフロントエンドがどちらの形で書くかは S17 | 未定。頻度は S17・S18 で見る | — | |
| F-04 | S1 | 仕様の穴 | 中 | `enrolled_only` を終える仕組みが手順書だけにある（期限・通知・デプロイでの確認がない）。また `enrolled_only` の間に `--remove` で電話を外したアカウントは、パスワードだけで入れる。V の `--remove` の説明「解除（ログインできなくなる）」は `all` のときだけ正しい | `src/lib/auth/mfaMode.ts`、`.github/workflows/deploy.yml`（値の形だけ確かめる）、`docs/Development.md` の `mfa:enroll` の例。S8: `tests/emulator/mfaStateTransitions.test.ts`「enrolled_only で電話を外したアカウント」で、電話を外すと `enrolled_only` では 200（パスワードだけで入れる）、`all` では 403 になることを Emulator で確かめた | 未定（期限を持たせるか、`--remove` の説明を直すか） | — | |
| F-05 | S1・S7 | バグ | 中 | reCAPTCHA の script の読み込みには10秒の期限があるが、読み込んだ後の `ready` と `execute` には期限がない。どちらかが返らないと、ボタンが「ログイン中…」のまま戻らない（R28 の仕様は「読み込めなければ」だけ） | `src/hooks/auth/recaptchaEnterprise.ts:53`（`ready` の中の `execute` に期限がない）。S7 で確かめた: `tests/unit/hooks/recaptchaEnterprise.test.ts` の `[F-05]`（`ready` が呼ばれない・`execute` が返らないと、30秒たっても終わらない）、`tests/unit/hooks/useLogin.stateMachine.test.ts` の `[F-05]`（`isPending` のまま、パスワードも送らない。120秒でも同じ）。どちらも `it.fails` | 一定の時間で理由を出して押せる状態に戻る（と思われる） | — | |
| F-06 | S1 | ドキュメント | 低 | N・D・S は「失敗の回数は SMS のコードが合ったときだけ0に戻す」と書くが、`enrolled_only` で SMS なしのログインが成功したときも0に戻す（コードと R1:165 は戻す）。例外が書かれていない | `src/application/auth/loginWithPasswordCommand.ts`（`completed`）、`docs/NormalOperation.md`、`docs/Domain.md` の `loginThrottle`、`docs/Security.md` | ドキュメントに例外を書く | — | |
| F-07 | S3 | 仕様の穴 | 低 | `enrolled_only` で電話を登録していないアカウントは、パスワードが合った時点で失敗の回数を0に戻す。その後に端末で断った（403 `client_not_allowed`）とき、ID トークンが無効（401 `login_failed`）のとき、ID トークンの確認や Session Cookie の作成が障害（503）のときも0に戻る。ログインは成功していない。`all` なら同じ場面は「数えない」（回数はそのまま） | `decisionTable.test.ts` の「enrolled_only: MFA なし・Linux」「トークンが無効」「トークンの確認の障害」「Session Cookie を作れない」の4行（表では '未定'）。原因は `src/application/auth/loginWithPasswordCommand.ts` の `completed`（Cookie を出す前に success を記録する） | 未定（0に戻すのは Session Cookie を出せたときだけにするか）。パスワードを知る者にしか起きない。S4: verify も同じ形で、コードが合えば、その後に ID トークンが無効・2要素目なし・端末で断った・503 でも0に戻す（`verify/decisionTable.test.ts`。こちらは仕様「コードが合ったときに0」どおり）。直すなら両方をそろえる | 回数の確定が、Route の後の手順を待たない | |
| F-08 | S3 | 気になる点 | 低 | ログイン API の 5xx の本文が、経路で2通りある: `handleRouteError` は `internal server error`（Firestore・Identity Toolkit の障害。InfraError のコードによって 500 か 503）、ID トークンの確認と Session Cookie の作成は `server error`（503）。画面は本文を読まず同じ文言を出す（AGENTS.md「ログイン画面では 500 と 503 を出し分けない」）ので、利用者には影響しない。API の status と本文で、どこが壊れたかを外から見分けられる | `decisionTable.test.ts` の「パスワードの確認の障害」「SMS の送信の障害」と「enrolled_only: … 障害」の行 | 未定（そろえるか） | — | |
| F-09 | S3 | 気になる点 | 低 | SMS を送った後に途中の状態を保存できない（Firestore の障害）と 503 になる。SMS は届くが、コードを使う途中の状態がないので、パスワードからやり直す（もう1通使う） | `src/application/auth/startMfaCommand.ts:53-56`、R1 の「途中の状態の保存 の障害は 503」 | 未定（F-02 と同じ種類。まれな障害） | 送ってから保存する順番 | |
| F-10 | S6 | 仕様の穴 | 低 | 23:00 の直前にパスワードを通すと SMS は送るが、23:00 を過ぎてからコードを送ると 403 `outside_business_hours` になる（SMS を1通使う）。画面は「利用時間外です（6:00〜23:00）」を出すが、コードの段のまま入力欄も使える（打ち直しても同じ 403）。ログイン画面は `fetchWithSession` を使わないので `/time-restricted` へは移らない。読み込み直すと `proxy.ts` が移す。途中の状態は期限（5分）まで残る | `tests/time/mfaBoundaries.test.ts` の「1段目が 22:59:59、2段目が 23:00:01」、`tests/unit/hooks/useLogin.time.test.ts` | 未定（22:55 以降は SMS を送らないか、時間外の 403 で `/time-restricted` へ移すか、今のままか）。旅館の利用時間（23:00 まで）の終わりにログインすることはまれ | — | |
| F-11 | S7 | 気になる点 | 低 | `useLogin` の `login` は送信中でも、`resend` はコードの確認中でも、呼ばれればもう一度送る（hook は止めず、画面のボタンを押せなくして止めている）。Enter キーなどボタン以外から呼ばれる経路があれば二重に送る。`verify` は確認中なら送らない（コメントどおり）ので、そろっていない | 一時的なプローブで確かめた（P… で `login` を呼ぶとまた送る、C… で `resend` を呼ぶと送る）。表は `docs/MfaSpecTrace.md`「ログイン画面の状態遷移」。画面から起きるかは S14 | 未定（hook でも止めるか） | — | |
| F-12 | S7 | バグ | 中 | `verify` は確認中かを state（`isPending`）で見ているので、描画の前に2回呼ばれると2回送る（hook のコメント「確認中・止められている間は送らずに false」に反する）。2回目は、1回目が途中の状態を使い終わっていれば `mfa_expired` になり、画面がパスワードの段へ戻る（1回目の成功の移動と競る）。同時に届けば、回数の札（busy）で1秒待って送り直す | `tests/unit/hooks/useLogin.stateMachine.test.ts` の `[F-12]`（`it.fails`）。コードの入力欄（6桁がそろったら送る）と Enter が同じ描画の中で重なるかは S14。S8: サーバーは同じ Cookie の同時の2回に、200 と 401 `mfa_expired` を1つずつ返す（Session Cookie は1つだけ。`mfaStateTransitions.test.ts`）。画面がこの 401 を後から受け取ると、パスワードの段に戻して「コードの有効期限が切れました」を出す | 確認中は2回目を送らない（ref で持つ） | `useLogin.ts` の `if (isLocked \|\| isPending) return false` が、描画の前の古い値を見る | |
| F-13 | S7 | 気になる点 | 低 | 再送（1段目の送り直し）が 401 `invalid_credentials`・403 `mfa_not_enrolled`・429 `sms_limit` などで断られても、コードの段のまま理由を出す。パスワードの誤りを、コードの段で言われる（戻るしかできない） | `tests/unit/hooks/useLogin.stateMachine.test.ts`「C での再送」の3行（今の動き） | 未定（パスワードが原因のときはパスワードの段へ戻すか）。再送の間にパスワード・電話の登録が変わったときだけ起きる | — | |
| F-14 | S8 | 仕様の穴 | 中 | 「コードを再送」はパスワードの段をもう一度通すので、新しい途中の状態と Cookie を作る。前の途中の状態とコードは、期限（5分）まで使える（Emulator で、1回目の Cookie と1回目のコードでも 200）。ブラウザの Cookie は2回目のものに替わるので、**再送の後に、遅れて届いた1通目の SMS のコードを打つと 401 `invalid_code` になり、失敗として数える**（画面は「コードが正しくありません」）。SMS が遅れて再送を押す場面で起きやすく、3回で止まる（同じ回線のほかの PC も。F-15） | `tests/emulator/mfaStateTransitions.test.ts`「再送の後に、1通目の SMS のコードを打つと…」「パスワードを2回通したら…」（今の動きを PROBE_OUT に残す）。本番の Identity Platform で、前のコードが使えるままかは未確認（S17） | 未定（前のコードも受け付けるか、再送の画面で「新しい SMS のコードを」と知らせるか、前の途中の状態を消すか） | 再送は1段目の送り直しで、前の途中の状態と結び付けていない | |
| F-15 | S8 | 気になる点 | 中 | 失敗の回数は IP ごとにも数えるので、旅館の PC が同じ回線（同じ IP）なら、1台のアカウントがコードを3回間違えると、ほかの PC のアカウントも正しいパスワードで 429 になる（1分。続けば5分・15分・1時間）。止まっている間は誰も成功できないので、回数は止める時間が過ぎるまで0に戻らない（ほかの PC が成功すれば0に戻る）。仕様（IP ごとにも数える）どおりだが、旅館での影響は大きい。F-14 と重なると起きやすい | `tests/emulator/mfaStateTransitions.test.ts`「PC1 のアカウントがコードを3回間違えると…」「PC2 のアカウントがコードを通すと…」 | 未定（IP の段の表をメールアドレスと分けるか、今のままか）。本番の PC が同じ IP かは S18 | `throttleKeys` がメールアドレスと IP に同じ表を使う | |
| F-16 | S10 | 気になる点 | 低 | Google の説明の文を Slack・ログに載せる前の伏せ方（`describeError`）は、空白・ハイフンで区切った数字と、つながった6桁以上の半角数字だけを伏せる。「.」で区切った電話番号（`090.1234.5678`）と全角の数字（`０９０１２３４５６７８`）は伏せずに残る（括弧の形 `(090)1234-5678` は市外局番だけが残る）。説明の文は Google が書くもので、利用者の入力が入ることは確認していない | `tests/pbt/auth.pbt.test.ts` の `[F-16]`（`it.fails`）。半角の連続・空白とハイフンの区切り・32文字以上の英数字・200文字の上限は、PBT（2000回）で守られている | 未定（区切りの文字を広げ、NFKC にしてから伏せるか） | 正規表現の区切りが `[\d\s-]` だけ | |
| F-17 | S11 | ドキュメント | 低 | AGENTS.md の層の表と、コードがずれている。(1) infra は「domain/ports だけ」に依存してよいが、`firestoreLoginThrottleRepository.ts` は `domain/auth/loginThrottle`、`firestoreSmsQuotaRepository.ts` は `domain/auth/smsQuota` を実行時に import する（判定をトランザクションの中で呼ぶため。意図した設計に見える）。(2) 型だけの import（components・types・constants → application・domain/ports・types）は、表では hooks にしか書かれていない（`ATaxTable.tsx`・`DailyTodoEditor.tsx`・`types/timetable.ts` など。MFA と関係のない前からのもの）。表にない例外は、新しいコードが真似してよいかが分からない | `tests/unit/config/architecture.test.ts`。(1) は理由つきの例外として、(2) は「型だけの import は domain・domain/ports・application・types に向けてよい」として固定した（新しい違反は落ちる） | 表に例外を書く（コードは今のまま）か、判定を domain/ports の側に移すか | — | |
| F-18 | S12 | 気になる点 | 低 | セッションの確認（`verifySession`。画面の API の `requireSession`）は、Session Cookie が2要素目を通ったものかを見ない。2要素目の確認は Cookie を出すとき（verify）だけ。`MFA_MODE=enrolled_only` の間に SMS なしで受け取った Cookie は、`all` に戻した後も期限（当日 23:00）まで使える。Development.md の手順は `all` への切り替えを時間外（23:00〜6:00）に行うので、手順どおりなら残らない | `tests/emulator/mfaSecurity.test.ts`「enrolled_only で出した SMS なしの Session Cookie は、all に戻しても…」 | 未定（`all` のときは `verifySession` でも `sign_in_second_factor` を見るか、手順で足りるとするか） | — | |
| F-19 | S13 | バグの疑い | 中 | 同じ回線の PC が同時にログインすると、「混み合っています。しばらくしてからもう一度お試しください」で終わる PC が出る。IP の試行中の札は「次に止める段までの残りの回数」までしか出ない（失敗0回で3枚、2回で1枚）。札はパスワードの確認（Identity Toolkit）の間ずっと持つ。画面の自動の送り直しは最大5回・1回1秒（サーバーの指定）なので、前の人の確認が終わるのを待ちきれない。Emulator で Identity Toolkit に 1.5秒の遅れを足すと: 5台同時・IP の前の失敗2回で 4/5・3/5、8台同時・前の失敗0回で 7/8・6/8 が通った（2回測った）。通った PC も送り直しを5回使い切っていた。0.5秒の遅れでは全員通った。本番の Identity Toolkit の応答の時間は未計測 | `npm run perf:mfa`（`tests/perf/mfaLogin.perf.ts`。結果は `perf-results/mfa-*.json`）。本番の応答の時間と、朝に同時に何台がログインするかは S18 | 旅館の台数（4〜5台）が同時に押しても、待てば全員が通る | 札の数（IP の key を、メールアドレスと同じ表で絞る。F-15）と、送り直しの回数・待ち時間が合っていない | |

## 網羅率（S2）

2026-11-16。`npm run coverage:auth`（unit・integration・PBT・fuzz）と `npm run coverage:auth:emulator` の分岐を合わせ、**どちらのテストでも通っていない分岐**だけを載せる。E2E（Playwright）は測っていない。
unit だけの値: 分岐 85.6%（482/563）。Emulator だけの値: 61.7%（235/381）。合わせると、下の表の分岐を除いてすべて通っている。

| ファイル | 分岐（合わせて） | 通っていない分岐 | 埋めるステップ |
|---|---|---|---|
| `src/app/api/auth/login/route.ts` | 34/35 → 35/35（S3） | ~~103: `enrolled_only` の SMS なしログインで、ID トークンの確認が障害（503）~~ S3 の表で通した | S3 |
| `src/app/api/auth/login/verify/route.ts` | 29/32 → 32/32（S4） | ~~53: verify の 429 `attempt_in_progress` / 75・82: トークンに email がないときの Slack の宛先~~ S4 の表で通した | S4 |
| `src/application/auth/verifyMfaCodeCommand.ts` | 11/14 → 14/14（S4） | ~~62: Firebase が止め、こちらも止め始めた / 71: 途中の状態を消せなかったとき~~ S4 の表で通した | S4 |
| `src/application/auth/loginAttempt.ts` | 13/14 → 14/14（S9） | ~~55: 回数の記録の失敗が InfraError でないとき~~ `tests/unit/application/loginAttempt.test.ts` | S9 |
| `src/hooks/auth/recaptchaEnterprise.ts` | 0/4 → 4/4（S7） | すべて（unit なし。`e2e/prod/recaptcha.spec.ts` が読み込みの成功と失敗だけを通る）。読み込み済みの `grecaptcha` の再利用、`enterprise` がない、`ready`・`execute` が返らない（F-05） | S7、S14 |
| `src/components/auth/LoginForm.tsx` | 0/26 | すべて（unit なし。E2E だけ） | S7、S14 |
| `src/components/auth/MfaCodeInput.tsx` | 34/39 | 105: `onSelect` でカーソルを末尾に戻す（jsdom では起きない） | S14 |
| `src/hooks/auth/useLogin.ts` | 91/93 → 93/93（S5） | ~~120: `phoneHint` が空・文字列でない / 251: 自動の送り直しで `retryAfterSeconds` がない~~ S5 で通した | S5 |
| `src/hooks/auth/fetchWithSession.ts` | 13/14 | 10: サーバー側で呼ばれたとき | 対象外（使われ方の確認だけ S11） |
| `src/infra/auth/firestoreLoginThrottleRepository.ts` | 21/24 | 70・78・98: key が0個 | 対象外（`throttleKeys` は必ず2個） |
| `src/infra/auth/firestoreSmsQuotaRepository.ts` | 3/4 → 4/4（S9） | ~~27: 形の崩れた `mfaSmsQuota` のドキュメント~~ `tests/emulator/mfaContracts.test.ts` | S9 |
| `src/infra/auth/identityToolkit.ts` | 16/18 → 17/18（S10） | 35: `split(...)[0] ?? ''` の右側（`split` は必ず1つ以上返すので**到達しない**。空のメッセージは S9 の `identityToolkit.test.ts` で通した）/ ~~47: 5桁以下の数字の並びを伏せずに残す~~ S10 の PBT で通した | 対象外 |
| `src/infra/auth/passwordSignIn.ts` | 15/16 | 54: `phone.phoneInfo ?? ''` の右側（`phoneInfo` があるものだけを選んでいるので**到達しない**） | 対象外 |
| `src/domain/auth/loginThrottle.ts` | 51/52 | 89: `acquireAll` の成功のときの `r.success ? … : []` の右側（断る結果があれば先に返すので**到達しない**）。一部の key だけ断られたときの動きは、S9 の契約テスト「片方の key だけ埋まっていれば busy」で確かめた | 対象外 |
| `src/lib/api/routeHelpers.ts` | 17/18 → 18/18（S10） | ~~48: Error でない例外の記録~~ `tests/unit/lib/nonErrorThrows.test.ts` | S10 |
| `src/lib/auth/loginNotice.ts` | 23/24 → 24/24（S10） | ~~83: IP の制限の通知で、IP の形でない値~~ `tests/pbt/auth.pbt.test.ts` | S10 |
| `src/lib/auth/verifySession.ts` | 16/17 → 17/17（S10） | ~~18: オブジェクトでない例外~~ `tests/unit/lib/nonErrorThrows.test.ts` | S10 |

ほかの対象（`startMfaCommand.ts`・`loginWithPasswordCommand.ts`・`mfaSignIn.ts`・`mfaPending.ts`・`smsQuota.ts`・`loginSession.ts`・`businessHours.ts` など）は、分岐をすべて通っている。

## 範囲外（MFA と関係ないが、作業中に見つけたもの）

| ステップ | 内容 | 再現 |
|---|---|---|
| S3、S5、S7 | `npm run test -- --run` を通しで流すと、ときどき予約まわりの UI テストと PBT が 5秒のタイムアウトで落ちる（`GuestInfoSection.test.tsx`、`ReservationModal.test.tsx`、`tests/pbt/reservationData.pbt.test.ts`）。落ちる組み合わせは毎回違い、ファイルだけを流すと通る（PBT は 2.5秒）。そのときの load average は16〜18（16コア）。CI で同じことが起きるかは見ていない。S7: このステップで足したテストを外しても、同じように落ちた（2回で5件・2件）。`--maxWorkers=8` でも1件落ちた。S2 で `npm ci` により vitest を 5.0.5 → 5.1.0（lockfile の版）にしてから目立つ。S10: `npm run coverage:auth` もこれで落ち、落ちると網羅率を書き出さない（ログインのテストのディレクトリに絞って測った）。S13: 落ちる数が 1〜7 件に増えた。S10 で足した `mfaHeaders.fuzz.test.ts` も一度これで落ちたので、そのテストだけ制限を30秒にした（ほかは触っていない） | 通しで2〜3回流す |
