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
| F-01 | S1 | 仕様の穴 | 中 | reCAPTCHA で断られたとき・Firebase が送信を止めたとき・`start` の障害のときも、SMS の1日の通数を1つ消費する。D の `/api/auth/login` は `recaptcha_failed` を「数えない」、「SMS が10通を超えたら」と書く一方、D の `mfaSmsQuota` と `domain/auth/smsQuota.ts` は「送る前に1つ足し、送れなかった分も戻さない」と書く。読み込み直しを繰り返すと、SMS が届かないまま上限に達しうる | `src/application/auth/startMfaCommand.ts:36`（`consume` が `startPhoneMfa` より前）。MC:98 は通数を見ていない | 未定（「SMS の上限」が数えるのは送れた SMS か、試みか） | 同時の送信で上限を超えないよう、送る前に数える設計 | |
| F-02 | S1 | 仕様の穴 | 中 | コードが合った後に ID トークンの確認（障害）か Session Cookie の作成で 503 になると、途中の状態はもう消えていて、パスワードからやり直しになる（SMS をもう1通使う）。仕様に書かれていない。画面はコードの段のまま「サービスが一時的に…」と出し、打ち直しても `mfa_expired` になる | `src/application/auth/verifyMfaCodeCommand.ts`（成功で `deleteQuietly`）→ `src/app/api/auth/login/verify/route.ts`（その後で `verifyLoginIdToken`・`issueSession`） | 未定（503 の後の画面の段と、途中の状態を残すか） | Firebase 側でもコードは使い終わっている | |
| F-03 | S1 | 仕様の穴 | 中 | 「パスワードのときと同じ接続元」は、`X-Forwarded-For` の右端の文字列の完全一致。最大5分の間に IPv4 と IPv6 が切り替わる、IPv6 の一時アドレスが変わる、Wi-Fi やモバイル回線に変わると、`mfa_expired` と Slack の `[ログイン拒否]` になる。どこまでを同じ接続元とみなすかは決まっていない。本番での頻度も分からない | `src/domain/auth/mfaPending.ts:19`（`pending.ip !== ip`） | 未定。頻度は S17・S18 で見る | — | |
| F-04 | S1 | 仕様の穴 | 中 | `enrolled_only` を終える仕組みが手順書だけにある（期限・通知・デプロイでの確認がない）。また `enrolled_only` の間に `--remove` で電話を外したアカウントは、パスワードだけで入れる。V の `--remove` の説明「解除（ログインできなくなる）」は `all` のときだけ正しい | `src/lib/auth/mfaMode.ts`、`.github/workflows/deploy.yml`（値の形だけ確かめる）、`docs/Development.md` の `mfa:enroll` の例 | 未定（期限を持たせるか、`--remove` の説明を直すか） | — | |
| F-05 | S1 | 仕様の穴（バグの疑い） | 中 | reCAPTCHA の script の読み込みには10秒の期限があるが、読み込んだ後の `ready` と `execute` には期限がない。どちらかが返らないと、ボタンが「ログイン中…」のまま戻らない（R28 の仕様は「読み込めなければ」だけ） | `src/hooks/auth/recaptchaEnterprise.ts:53`（`ready` の中の `execute` に期限がない）。動きの確認は S7・S14 | 一定の時間で理由を出して押せる状態に戻る（と思われる） | — | |
| F-06 | S1 | ドキュメント | 低 | N・D・S は「失敗の回数は SMS のコードが合ったときだけ0に戻す」と書くが、`enrolled_only` で SMS なしのログインが成功したときも0に戻す（コードと R1:165 は戻す）。例外が書かれていない | `src/application/auth/loginWithPasswordCommand.ts`（`completed`）、`docs/NormalOperation.md`、`docs/Domain.md` の `loginThrottle`、`docs/Security.md` | ドキュメントに例外を書く | — | |

## 網羅率（S2）

| ファイル | 分岐 | 通っていない分岐 |
|---|---|---|
