# Security 対策の TODO

[Security.md](Security.md) §8 を実装する。終わったら Security.md §7 に移し、ここから消す。【人】は本番の権限・管理画面の操作。

順番: 1 → 2 → 3 → 4。5 はいつでも。

## 1. 手作業

- [ ] 【人】Environment `production` を作る（ブランチは `main` だけ）。`deploy.yml` の secrets をそこへ移す
- [ ] `deploy.yml` の job に `environment: production` を足す
- [ ] 【人】WIF の属性条件に ` && assertion.environment == 'production'` を足す（今の条件を控えてから `update-oidc`）
- [ ] 【人】保護を確かめる: 直接 push・force push・削除・CI 失敗の PR のマージ・`main` 以外からの GCP 認証が拒否される
- [ ] 【人】Secret scanning・Push protection が非公開リポジトリで使えるか確かめ、結果を Security.md §8 に書く
- [ ] 【人】GCP のオーナーを管理専用の Google アカウントに移し、普段のアカウントから外す
- [ ] 【人】Slack の Webhook を作り直し、Secret Manager（`slack-webhook-url`）に置く。`ryokan-runtime` にその secret の `secretAccessor` を付ける
- [ ] `deploy.yml` の `SLACK_WEBHOOK_URL` を `env_vars` から `secrets:` に替える
- [ ] 【人】通知を確かめてから、古い Webhook と GitHub Secrets の `SLACK_WEBHOOK_URL` を消す
- [ ] 【人】Firestore の PITR・削除保護・毎日のバックアップを有効にする（`gcloud firestore databases update --enable-pitr --delete-protection`、`gcloud firestore backups schedules create --recurrence=daily`）。restore を別の database で1回試す

## 2. SMS による MFA

- [ ] 【人】SMS を受け取る携帯電話を決める（例: フロントの業務用携帯＋予備に責任者の携帯）
- [ ] 【人】Identity Platform にアップグレードし、SMS 多要素認証を有効にする。SMS の送り先は日本だけにする
- [ ] 開発用ユーザーを `emailVerified: true` にし、MFA の電話番号を登録する（seed）
- [ ] ログイン画面: パスワードのあと、invisible の reCAPTCHA で SMS を送り、コードを入力して `resolveSignIn` する。コードの誤り・期限切れ・送りすぎのメッセージ、再送ボタン
- [ ] ログイン画面の CSP・COEP を reCAPTCHA に合わせる。`csp.test.ts` を更新する
- [ ] テスト: unit・E2E・Emulator（コードは Emulator の REST で取る）
- [ ] `scripts/ops/enrollMfa.ts`: PC のアカウントに `emailVerified: true` と電話番号を登録する（既存の登録を残す。dry-run 付き）
- [ ] 【人】Claude を止めて、本番で `enrollMfa.ts` を実行する
- [ ] 【人】デプロイし、各 PC（Chrome・Edge）で SMS のコードを入れてログインできるか確かめる
- [ ] `/api/auth/login` で ID トークンの `firebase.sign_in_second_factor` を確かめ、MFA を通っていないログインを拒否する
- [ ] 【人】デプロイしてログインを確かめ、Security.md を更新する

## 3. ログインのサーバー経由化と失敗回数の制限

- [ ] 2 のあとに、やるかを決める
- [ ] 失敗回数の制限: Firestore（例: `loginAttempts`）にメールと IP ごとの失敗を記録し、上限で 429 と Slack 通知
- [ ] サーバーから `accounts:signInWithPassword`（MFA は `mfaSignIn:start` / `:finalize`）を呼ぶ。パスワードの長さの上限を Zod で確かめる
- [ ] ブラウザから Firebase の SDK と `NEXT_PUBLIC_FIREBASE_*` を外す
- [ ] 【人】Identity Toolkit だけに制限した新しい API キーをサーバーに置き、ログインを確かめてから古いキーを消す

## 4. Terraform

- [ ] GCP・GitHub の設定を Terraform で書く
- [ ] 【人】`terraform import` し、`plan` で差分がないことを確かめる

## 5. 依存のアップグレード

- [x] `@types/node` 26.6.6（#124）
- [x] `@mui/material`・`@mui/icons-material`・`@mui/material-nextjs` を一緒に 9.5 へ（#115・#119・#120）。移行ガイドを読み、nonce と印刷の見た目を確かめる（nonce は確認済み。見た目は次の【人】）
- [ ] 【人】MUI のあと、画面と印刷の見た目を確かめる（特に国名の入力、ログイン画面、予約の追加カードとモーダルのアイコン）
- [x] `dependabot.yml` に `@mui/*` のグループを足す
- [x] `jsdom` 30・`@testing-library/jest-dom` 7（#116・#118）。31 は公開から7日たっていないので 30.1.3
- [ ] 【人】#102（TypeScript 7）と #117（ESLint 10）を閉じる。`typescript-eslint`・`eslint-plugin-react` が対応したら上げ直す
