# SMS の MFA で、まだ確かめていないこと

`feature/mfa` のうち、まだ確かめていないことの一覧（2026-11-14 時点）。確かめたら、この表から消す。本番の設定の手順は [Development.md](Development.md)「SMS の2要素目」、計画は [NormalOperationPlan.md](NormalOperationPlan.md) の 2。

## 1. 不安定なテスト（`make check` が安定して通らない）
- 複数回改めて実行したうえで原因を特定する必要あり

## 2. 本番の Identity Platform に対して通していないこと(具体的にこれからどうするかは未定)

- **`finalize` のエラーコード**: `src/infra/auth/mfaSignIn.ts` の振り分け（`INVALID_CODE`・`SESSION_EXPIRED`・`CODE_EXPIRED` など）は、Emulator と想定で書いた。本番が返す実際のコード名は見ていない。違っていると、コードの誤りが 503 と Slack の `[ALERT]` になる
- **reCAPTCHA の点数が低くて SMS を送らなかったときのコード**: 分かっていない。今は 503 と `[ALERT]` になる
- **ログイン画面で作った token**: 本番のドメインのログイン画面が作った token を、本物の Google が受け付けるかは試していない。スパイクは別の道具（`scripts/spike/`）と `localtest.me` で行った
- **Fraud Defense の「SMS fraud risk threshold score」**: 旅館の PC・回線での点数を見ていないので、まだ決まっていない

## 3. 登録スクリプト（`scripts/mfa/enrollPhone.ts`）(とりあえず実行してみる)

- **本番での実行**: 未実施
- **1つの電話番号を3つのアカウントに登録できるか**: 確かめていない

## 4. 本番の設定（どれも未実施）(上記等の準備ができてから実行してみる)

- Identity Platform への切り替え、MFA（SMS）の有効化、SMS の地域を日本だけにする設定
- reCAPTCHA Enterprise（Fraud Defense）の設定と、Web のサイトキーの作成。許可ドメインと、Identity Platform の承認済みドメインに本番のドメイン
- GitHub の Variables への `RECAPTCHA_SITE_KEY` の登録。**`main` に入れる前に必要**。ないと `deploy.yml` が最初のステップで落ち、MFA と関係のない修正もデプロイできなくなる
- Firestore の TTL ポリシー: `mfaPending.expireAt`、`mfaSmsQuota.expireAt`
- 夜間の切り替えと、だめだったときに前のリビジョンへ戻して `--remove` で登録を外す手順。どちらも試していない
