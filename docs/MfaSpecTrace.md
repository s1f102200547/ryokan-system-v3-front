# SMS の MFA の仕様とテストの対応（S1）

[MfaBugHunt.md](MfaBugHunt.md) の S1。仕様文の出典は Domain.md（D）・NormalOperation.md（N）・Security.md（S）・Development.md（V）・`src/constants/auth.ts`（C）。2026-11-16 時点。
判定: ○ テストあり / △ 一部だけ（足すステップ）/ × なし（足すステップ）/ ? 仕様が決まっていない（記録の ID）

テストの場所の略: R1 = `tests/integration/api/auth/login/route.test.ts`、R2 = `tests/integration/api/auth/login/verify/route.test.ts`、
MC = `tests/unit/application/mfaCommands.test.ts`、PBT = `tests/unit/application/loginWithPasswordCommand.pbt.test.ts`、
EM = `tests/emulator/mfaLogin.test.ts`、UL = `tests/unit/hooks/useLogin.test.ts`、E2E = `e2e/login.spec.ts`

## 1段目 `POST /api/auth/login`

| # | 仕様 | 出典 | テスト | 判定 |
|---|---|---|---|---|
| R01 | email はブラウザの `type="email"` と同じ形式で3〜254文字、パスワードは3〜256文字、token は1〜4096文字。外れれば 400（Firebase に送らず数えない） | D, S | R1:314・345・349・218（4097文字）、E2E:175 | △ token 4096文字ちょうどが通ることは S5 |
| R02 | 合えば 200 `{ mfaRequired, phoneHint }` と `mfa_pending`（HttpOnly・SameSite=Strict・Path=/api/auth/login・5分）。Session Cookie はまだ出さない | D | R1:81・104〜115 | ○（実ブラウザでの属性は S12） |
| R03 | 違えば 401 `invalid_credentials`。存在しないメールアドレスも同じに数える | D, S | R1:440、`tests/emulator/loginThrottle.test.ts`:72 | △ 応答の時間がそろうかは S12 |
| R04 | 失敗が続けば 429 `too_many_attempts`（`retryAfterSeconds`・`Retry-After`）。3回で1分、4回で5分、5回で15分、6回以降は1時間。止めている間は数えない | D, N, S | R1:451・469、`tests/unit/domain/auth/loginThrottle.test.ts` | ○ |
| R05 | 同時の試行は 429 `attempt_in_progress`。画面が自動で送り直す（最大5回・1回3秒まで） | D | R1:558、UL:104〜154 | △ 4〜5台の同時ログインで再試行を使い切らないかは S13 |
| R06 | 1アカウントの SMS は1日（JST）10通まで。超えたら 429 `sms_limit`、Slack の `[SMS 上限]` は1日1回 | D, N, S | R1:268、MC:76・85、`tests/unit/domain/auth/smsQuota.test.ts` | ○（数え方は F-01） |
| R07 | 本番の時間外（6:00〜23:00 の外）は 403 `outside_business_hours`。パスワードもコードも確かめない | D, S | `tests/time/loginBusinessHours.test.ts` | △ 22:59 にパスワード → 23:00 に verify の組は S6 |
| R08 | Windows の Chrome・Edge 以外は 403 `client_not_allowed`。パスワードが合った後に確かめ、SMS を送らず数えない | D, S | R1:280・369〜410・521、`e2e/emulator/clientCheck.spec.ts` | ○ |
| R09 | `MFA_MODE=all` で電話の登録がなければ 403 `mfa_not_enrolled`。Slack に `[ログイン拒否]` | D, S | R1:120、EM:84 | ○ |
| R10 | `MFA_MODE=enrolled_only` で登録がなければ、SMS なしで 200 `{ success }` と Session Cookie。トークンが無効なら 401 `login_failed`。Slack の `[ログイン]` に `SMS なし` | D, V, S | R1:142〜188、EM:97 | ○ |
| R11 | `MFA_MODE` が未設定・想定外なら `all`。デプロイの前に値を確かめる | V, C | R1:198、`tests/unit/lib/mfaMode.test.ts`、`tests/unit/config/deployWorkflow.test.ts` | ○ |
| R12 | Google が token を断ったら 403 `recaptcha_failed`（SMS を送らない。数えない） | D | R1:228（失敗の回数が増えないことだけ） | ? F-01（SMS の通数に数えるか） |
| R13 | token を渡したときだけ `captchaResponse` を添える。渡していないのに断られたら設定の誤りとして 503。知らないコードも 503 と `[ALERT]` | V | `tests/unit/infra/auth/mfaSignIn.test.ts`:43〜114 | ○ |
| R14 | 再送は token を作り直し、同じ body を送り直す | D | UL:362・429 | ○ |

## 2段目 `POST /api/auth/login/verify`

| # | 仕様 | 出典 | テスト | 判定 |
|---|---|---|---|---|
| R15 | コードは半角数字6桁。外れれば 400（数えない） | D, S | R2:124、`tests/unit/lib/mfaCodeInput.test.ts`:40 | ○ |
| R16 | 途中の状態がない・期限切れ（5分）・接続元が違えば 401 `mfa_expired`。途中の状態は消す。接続元の違いは Slack に | D, N | R2:143・155・164、MC:134・143、EM:121 | ○（「同じ接続元」の範囲は F-03） |
| R17 | 接続元は `X-Forwarded-For` の右端 | D, S | R2:173、R1:508 | △ 本番で右端が Google の値かは S17 |
| R18 | コードが違えば 401 `invalid_code`。途中の状態は残り、打ち直せる。パスワードの誤りと同じ表で数える | D | R2:192・204、EM:58・74、`e2e/emulator/loginThrottle.spec.ts`:54 | ○ |
| R19 | 失敗の回数はコードが合ったときだけ0に戻す（パスワードが合っただけでは戻さない） | D, N, S | R2:220、PBT:144、`tests/emulator/loginThrottle.test.ts`:84 | ○（例外の書き漏れは F-06） |
| R20 | 同じ IP の別アカウントの失敗も、IP の回数に足す | S | R1:493（パスワードだけ） | △ コードの誤りで別アカウント・別 PC が止まるかは S8 |
| R21 | コードは合ったが ID トークンが無効なら 401 `login_failed`（理由は返さず、Slack に Firebase のコード） | D | R2:267〜294 | ○ |
| R22 | 2要素目を通ったトークン（`sign_in_second_factor === 'phone'`）だけに Session Cookie | D, S | R2:251、`tests/unit/lib/secondFactor.test.ts`、EM:42 | ○ |
| R23 | 一度使った途中の状態は使えない | D | MC:119、EM:128 | ○ |
| R24 | Firebase の障害は数えず 503。途中の状態は残る | V | R2:236、MC:158 | ○（コードが合った後の 503 は F-02） |
| R25 | Session Cookie は当日 23:00 JST まで（最短5分）。1アカウント1セッション | D, S | `tests/time/sessionExpiry.test.ts`、R2:355、`e2e/emulator/singleSession.spec.ts` | ○ |

## 画面・時間帯・ヘッダー

| # | 仕様 | 出典 | テスト | 判定 |
|---|---|---|---|---|
| R26 | コードの入力: 打ち直し・再送・戻る。6桁そろえばボタンなしで送る。全角は半角に、区切りは捨て、ほかの文字は理由を出す | D | `tests/unit/components/auth/MfaCodeInput.test.tsx`、E2E:66〜110 | △ 本物の日本語入力・SMS の自動入力は S14・S18 |
| R27 | 再送は SMS を送ってから30秒押せない（画面だけで数え、読み込み直すと戻る） | D, C | UL:334〜392、E2E:142 | △ 29.999秒の境目は S5 |
| R28 | reCAPTCHA を読み込めなければ、パスワードを送らずに理由を出す | V | UL:454、`e2e/prod/recaptcha.spec.ts`:113 | △ 読み込めた後に `ready`・`execute` が終わらない場合は F-05 |
| R29 | ログイン以外の API は 6:00〜23:05 の外で 403（セッションを確かめる前、Slack なし）。画面は `/time-restricted` へ | D, N, S | `tests/time/apiBusinessHours.test.ts`、`tests/unit/hooks/fetchWithSession.test.ts` | △ ログイン必須の hook が `fetch` を直接使っていないかは S11 |
| R30 | `/login` だけ CSP に reCAPTCHA の frame-src・connect-src を足し、COEP を付けない | S | `tests/unit/lib/csp.test.ts`:33・48、`e2e/prod/securityHeaders.spec.ts`:300、`e2e/prod/recaptcha.spec.ts` | ○ |

## データと秘密

| # | 仕様 | 出典 | テスト | 判定 |
|---|---|---|---|---|
| R31 | `mfaPendingCredential`・`sessionInfo`・コード・token・パスワードは、ログにも Slack にもレスポンスにも出さない | D, S | R1:259・614、R2:341、MC（`expectNoSecretsLogged`） | ○（`describeError` の PBT は S10） |
| R32 | `mfaPending` の ID は Cookie の値の SHA-256。形の崩れたドキュメントはなかったものとして扱う | D | `tests/unit/infra/auth/firestoreMfaPendingRepository.test.ts`、`tests/emulator/mfaStores.test.ts`:22・37 | ○ |
| R33 | `mfaSmsQuota` は送る前にトランザクションで1つ足す。`expireAt` は最後に書いてから2日 | D | `tests/emulator/mfaStores.test.ts`:45 | △ `expireAt` の値は S9 |
| R34 | TTL ポリシー（`mfaPending.expireAt`・`mfaSmsQuota.expireAt`・`loginThrottle.expireAt`） | D, V | — | × クラウドの設定。S16 |

## ログイン画面の状態遷移（S7、`src/hooks/auth/useLogin.ts`）

状態: **P** パスワードの段 / **P…** 1段目を送っている（「ログイン中…」）/ **P🔒** パスワードの段で止められている /
**C** コードの段（再送の待ちあり・なし）/ **C…** コードを確認中、または再送中 / **C🔒** コードの段で止められている / **→** ダッシュボードへ移っている（移り終わるまで「確認中…」）。
テスト: `tests/unit/hooks/useLogin.stateMachine.test.ts`（表の全行）、`tests/unit/hooks/useLogin.test.ts`、`tests/unit/hooks/useLogin.boundaries.test.ts`

| 元 | 出来事 | 先 | 画面に出すもの |
|---|---|---|---|
| P | login | P… | — |
| P… | 200 `mfaRequired` | C（再送は30秒待ち） | 伏せ字の番号 |
| P… | 200 `success`（SMS なしのログイン） | → | — |
| P… | 401 `invalid_credentials` / `login_failed` | P | パスワードの誤り / 「ログインできませんでした」 |
| P… | 429 `too_many_attempts` | P🔒 | 「あと M:SS」 |
| P… | 429 `attempt_in_progress` | P…（最大5回、自動で送り直す）→ P | 「混み合っています」 |
| P… | 429 `sms_limit` / 403（理由ごと）/ 5xx / 通信エラー / reCAPTCHA を読み込めない | P | 理由 |
| P🔒 | 時間が来る | P | — |
| C | verify | C… | — |
| C… | 200 | → | — |
| C… | 401 `invalid_code` | C | 「コードが正しくありません」 |
| C… | 401 `mfa_expired` / `login_failed` | P | 期限切れ / 「ログインできませんでした」 |
| C… | 429 `too_many_attempts` | C🔒 | 「あと M:SS」 |
| C… | 403 / 5xx / 通信エラー | C | 理由 |
| C | resend（待ちが0のとき） | C… → C（また30秒待ち） | 「コードを再送しました」 |
| C… | 再送が 401・403・429 `sms_limit` | C | 理由（コードの段のまま。F-13） |
| C🔒 | 時間が来る | C | — |
| C / C🔒 | back | P / P🔒（止められている状態は残る） | エラーと知らせを消す |

**送らない（何もしない）こと**: P🔒・C🔒 での login・verify・resend、C… での verify（**同じ描画の中で2回呼ぶと2回送る**: F-12）、再送の待ちの間の resend。
**hook では止めず、画面のボタンで止めていること**: P… での login、C… での resend（F-11）。P での resend は、戻る前のメールアドレスとパスワードで1段目を送り直し、C へ移る（画面に再送のボタンがないので起きない）。
**決まっていないこと**: reCAPTCHA の token が返らないとき、P… のまま戻らない（F-05）。
