# NormalOperationPlan（★の実装計画）

[NormalOperation.md](NormalOperation.md) の「まだ」のうち、★を付けた項目を実装する計画。終わった項目は NormalOperation.md の「実装済み」へ移し、この計画からは消す。

A（端末とブラウザ）・B（1アカウント1セッション）・D（ログインのサーバー経由化と失敗回数の制限）は実装済み。C（SMS の MFA）はコード（reCAPTCHA Enterprise を含む）を実装済みで、本番での有効化が残っている。

## 1. スパイクで分かったこと（2026-11-12、テスト用の GCP プロジェクト）

- `mfaSignIn:start` は、API キーだけでは `MISSING_CLIENT_IDENTIFIER`、管理者の OAuth トークンでは 401 で断られる。**ブラウザで作った reCAPTCHA Enterprise の token が要る**（`captchaResponse`・`clientType: CLIENT_TYPE_WEB`・`recaptchaVersion: RECAPTCHA_ENTERPRISE`）
- token を添えれば SMS が届く。**`localhost` で作った token は断られる**（`INVALID_RECAPTCHA_TOKEN: localhost is not supported`）。`localtest.me` なら通った
- reCAPTCHA v2 の token は、SMS defense が ENFORCE のときは `Internal error` で使えない
- SMS の地域の許可が空だと `OPERATION_NOT_ALLOWED: SMS unable to be sent until this region enabled`
- API で `recaptchaConfig` を設定しても Web のサイトキーは作られなかった。Firebase コンソールの Fraud Defense で作る
- スパイクの道具: `npm run spike:mfa`（API キー・Bearer）、`npm run spike:recaptcha`（ブラウザで token を作る）。本番が動いたら `scripts/spike/` ごと消す

## 2. C の本番での有効化（ユーザー）

- [ ] Firebase Authentication の Identity Platform への切り替え（課金が変わる）と、MFA（SMS）の有効化
- [ ] SMS の送り先の地域を日本だけにする
- [ ] reCAPTCHA Enterprise の API の有効化。Firebase コンソールの Authentication → Settings → Fraud Defense で SMS defense を ENFORCE にし、Web のサイトキーを作る。許可ドメインに本番のドメイン
- [ ] Identity Platform の承認済みドメインに本番のドメイン
- [ ] Fraud Defense の「SMS fraud risk threshold score」を決める（既定の 0 は危険度が少しでもあれば送らない。テスト用のプロジェクトで、旅館の PC・回線での点数を見てから）
- [ ] GitHub の Variables（Secrets ではない）に `RECAPTCHA_SITE_KEY` を登録する（`.github/workflows/deploy.yml` が `env_vars` で Cloud Run に渡す）
- [ ] 料金の見積もり（SMS と reCAPTCHA Enterprise の評価の回数。少なくとも「PC の台数 × 1日1回」）
- [ ] フロントに置く電話の用意。電話番号1つを3つのアカウントすべてに登録できるか確かめる
- [ ] Firestore の TTL ポリシー: `mfaPending.expireAt`、`mfaSmsQuota.expireAt`
- [ ] 夜間の切り替え（[Development.md](Development.md)「SMS の2要素目」の手順）

## 3. 終わったら更新するもの

- [NormalOperation.md](NormalOperation.md): 「使う人」「場所」の「本番での有効化」を消す
- [Security.md](Security.md): §8「条件待ち」の「SMS による MFA の本番での有効化」を消す
- この計画: C を消す。`scripts/spike/` と `package.json` の `spike:*` を消す
