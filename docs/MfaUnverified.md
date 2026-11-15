# SMS の MFA で、まだ確かめていないこと

`feature/mfa` のうち、まだ確かめていないことの一覧（2026-11-14 時点）。確かめたら、この表から消す。本番の設定の手順は [Development.md](Development.md)「SMS の2要素目」、計画は [NormalOperationPlan.md](NormalOperationPlan.md) の 2。

## 1. 不安定なテスト（`make check` が安定して通らない）
- 2026-11-15 に単独で実行して、すべて通った（`e2e` 5回・`e2e:emulator` 5回・`e2e:prod` 3回）
- 2026-11-14 の `make check` で落ちたのは `e2e/emulator/sessionCookie.spec.ts` の失効のテスト（`page.goto: net::ERR_ABORTED`）。2026-11-15 に再現し、`commit` より前に打ち切られていた。ログイン直後のダッシュボードがまだ API を呼んでいて、失効の後にその応答が 401 になり、前のページの `location.assign('/login')` が次の `goto` を上書きしていた（テスト側の問題）。失効の前に `about:blank` へ離れ、`goto` は `waitUntil: 'commit'` にした（`singleSession.spec.ts` の同じ形も）。直した後、全体を5回 × 2（150 件）と失効のテストだけを 30 回流して、`ERR_ABORTED` は出なかった
- **まだ原因が分からない失敗が1件**: 直した後の150件のうち1件で、失効のテストが「ダッシュボードは開いたが `/login` に移らず、30秒で時間切れ」になった（普段は6秒）。trace がなく、401 が返らなかったのか、画面が止まったのかは分からない。同じ条件でもう一度流すと出なかった。次に起きたら追えるよう、`playwright.emulator.config.ts` の trace を `retain-on-failure` にした（`test-results-emulator/` に残る）
- 残り: `make check` を何回か通す。上の時間切れが出たら trace を見る

## 2. 本番の Identity Platform に対して通していないこと(具体的にこれからどうするかは未定)

- **`finalize` のエラーコード**: `src/infra/auth/mfaSignIn.ts` の振り分け（`INVALID_CODE`・`SESSION_EXPIRED`・`CODE_EXPIRED` など）は、Emulator と想定で書いた。本番が返す実際のコード名は見ていない。違っていると、コードの誤りが 503 と Slack の `[ALERT]` になる
- **reCAPTCHA の点数が低くて SMS を送らなかったときのコード**: 公式のトラブルシューティングが挙げる `CAPTCHA_CHECK_FAILED` は、`INVALID_RECAPTCHA_TOKEN` と同じく 403 と `[ログイン拒否]` にした（Slack に Firebase のコードが付く）。本番で実際にこのコードが来るかは見ていない。SMS defense（料金詐欺の判定）で止めたときのコードは公式にも書かれておらず、来たら 503 と `[ALERT]`（コード名つき）になるので、見て `src/infra/auth/mfaSignIn.ts` に足す
- **ログイン画面で作った token**: 本番のドメインのログイン画面が作った token を、本物の Google が受け付けるかは試していない。スパイクは別の道具（`scripts/spike/`）と `localtest.me` で行った
- **Fraud Defense の「SMS fraud risk threshold score」**: 最初は **0.8**（公式の推奨の出発点。点数がこれを超えると送らない。低いほど厳しく、0.0 は全部止まる）。旅館の PC・回線での実際の点数（Cloud Monitoring の `identitytoolkit.googleapis.com/recaptcha/sms_tf_risk_scores`）を見て、下げるかを決める

## 3. 登録スクリプト（`scripts/mfa/enrollPhone.ts`）(とりあえず実行してみる)

- **本番での実行**: 未実施
- **1つの電話番号を3つのアカウントに登録できるか**: 確かめていない

## 4. 本番の設定（どれも未実施）(上記等の準備ができてから実行してみる)

- Identity Platform への切り替え、MFA（SMS）の有効化、SMS の地域を日本だけにする設定
- reCAPTCHA Enterprise（Fraud Defense）の設定と、Web のサイトキーの作成。許可ドメインと、Identity Platform の承認済みドメインに本番のドメイン
- GitHub の Variables への `RECAPTCHA_SITE_KEY` の登録。**`main` に入れる前に必要**。ないと `deploy.yml` が最初のステップで落ち、MFA と関係のない修正もデプロイできなくなる
- Firestore の TTL ポリシー: `mfaPending.expireAt`、`mfaSmsQuota.expireAt`
- GitHub の Variables への `MFA_MODE` の登録（最初は `enrolled_only`）。`RECAPTCHA_SITE_KEY` と同じく、**`main` に入れる前に必要**
- 開発者のアカウントだけで試す手順（`MFA_MODE=enrolled_only`）と、全員に広げて `MFA_MODE=all` に戻す手順。どちらも試していない（[Development.md](Development.md)「SMS の2要素目」）
