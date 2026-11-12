# NormalOperationPlan（★の実装計画）

[NormalOperation.md](NormalOperation.md) の「まだ」のうち、★を付けた項目を実装する計画。終わった項目は NormalOperation.md の「実装済み」へ移し、この計画からは消す。

A（端末とブラウザ）・B（1アカウント1セッション）・D（ログインのサーバー経由化と失敗回数の制限）は実装済み。C（SMS の MFA）はコードを実装済みで、本番での有効化が残っている。

## 1. 残っていること

| 項目 | 誰が | 主に変える場所 |
|---|---|---|
| C の本番での有効化（下の 2） | ユーザー | Firebase・GCP の設定、`scripts/mfa/enrollPhone.ts` の実行 |
| reCAPTCHA の段（下の 3。スパイクで要ると分かったときだけ） | 開発 | `src/infra/auth/identityToolkit.ts`、要るときはログイン画面・CSP・COEP |

## 2. C の本番での有効化（コードの外）

- [ ] スパイク: テスト用の GCP プロジェクトで Identity Platform と SMS の MFA を有効にし、電話を登録したユーザーで `signInWithPassword` → `mfaSignIn:start` を (a) API キーだけ (b) サービスアカウントの Bearer トークン で呼ぶ。reCAPTCHA の token を求められるか（`MISSING_RECAPTCHA_TOKEN`・`INVALID_APP_CREDENTIAL`）。SMS が届くまでの時間（朝のログインが遅くならないか）
- [ ] Firebase Authentication の Identity Platform への切り替え（課金が変わる）
- [ ] SMS の送り先の地域を日本だけにする（SMS pumping の対策）
- [ ] 料金の見積もり。セッションは毎日 23:00 で切れるので、少なくとも「PC の台数 × 1日1回」の SMS が出る
- [ ] フロントに置く電話の用意。電話番号1つを3つのアカウントすべてに登録できるか確かめる
- [ ] Firestore の TTL ポリシー: `mfaPending.expireAt`、`mfaSmsQuota.expireAt`
- [ ] 夜間の切り替え（[Development.md](Development.md)「SMS の2要素目」の手順）

## 3. reCAPTCHA の段（スパイクで要ると分かったときだけ）

今は `mfaSignIn:start` に `phoneSignInInfo: {}` を送っている。reCAPTCHA を求められたら、ログインは 503 になり Slack に `MFA sign-in start failed: MISSING_RECAPTCHA_TOKEN` などと出る。

1. まず、サービスアカウントの Bearer トークンで呼べば reCAPTCHA なしで通るかを試す。通れば `identityToolkit.ts` の認証を API キーから Bearer に切り替えるだけ（Cloud Run の実行用サービスアカウントに権限を足す。ブラウザ・CSP は変えない）
2. だめなら、`/login` でだけ reCAPTCHA を動かし、token を `/api/auth/login` に一緒に送る。変える場所: `src/hooks/auth/useLogin.ts`、`src/app/login/page.tsx`、`src/lib/api/loginSchema.ts`、`src/infra/auth/mfaSignIn.ts`、`src/lib/csp.ts`（script-src・frame-src・connect-src）、`src/proxy.ts`（`/login` だけ COEP を `credentialless` にする候補）、`tests/unit/lib/csp.test.ts`、`e2e/prod/`、AGENTS.md の「壊してはいけないもの」6・7

## 4. 終わったら更新するもの

- [NormalOperation.md](NormalOperation.md): 「使う人」「場所」の「本番での有効化」を消す
- [Security.md](Security.md): §8「条件待ち」の「SMS による MFA の本番での有効化」を消す。reCAPTCHA を入れたら §7 の CSP の記述
- この計画: C を消す
