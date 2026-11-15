# SMS の MFA で、まだ確かめていないこと

`feature/mfa` のうち、まだ確かめていないことの一覧（2026-11-14 時点）。確かめたら、この表から消す。本番の設定の手順は [Development.md](Development.md)「SMS の2要素目」、計画は [NormalOperationPlan.md](NormalOperationPlan.md) の 2。

## 4. 本番の設定（どれも未実施）(上記等の準備ができてから実行してみる)

- Identity Platform への切り替え、MFA（SMS）の有効化、SMS の地域を日本だけにする設定
- reCAPTCHA Enterprise（Fraud Defense）の設定と、Web のサイトキーの作成。許可ドメインと、Identity Platform の承認済みドメインに本番のドメイン
- GitHub の Variables への `RECAPTCHA_SITE_KEY` の登録。**`main` に入れる前に必要**。ないと `deploy.yml` が最初のステップで落ち、MFA と関係のない修正もデプロイできなくなる
- Firestore の TTL ポリシー: `mfaPending.expireAt`、`mfaSmsQuota.expireAt`
- GitHub の Variables への `MFA_MODE` の登録（最初は `enrolled_only`）。`RECAPTCHA_SITE_KEY` と同じく、**`main` に入れる前に必要**
- 開発者のアカウントだけで試す手順（`MFA_MODE=enrolled_only`）と、全員に広げて `MFA_MODE=all` に戻す手順。どちらも試していない（[Development.md](Development.md)「SMS の2要素目」）
