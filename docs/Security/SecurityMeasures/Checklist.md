# 設定の点検（チェックリスト）

リポジトリの外にある設定の確認項目。`T1.md`〜`T8.md` の対策表にある項目（パスキー、WIF の条件、Cloud Run の専用サービスアカウント、Firestore Rules、SHA 固定の強制、Dependabot、ルールセット、Environment、Secret scanning など）は省略する。

| # | 確認項目 | 望ましい状態 | 効く脅威 | 段階 |
|---|---|---|---|---|
| F1 | ログイン方法 | メール/パスワードだけ有効。匿名ログインなど使わない方法は無効 | T1 | P0 |
| F2 | Firebase Auth のユーザー一覧 | PC の4アカウントだけ。テスト用や不要なアカウントがない | T3 | P0 |
| F3 | 承認済みドメイン | `localhost` など不要なドメインを外し、本番の `run.app` だけにする | T1 | P0 |
| F4 | メール列挙保護 | 有効（「そのメールアドレスは存在しない」と返さない） | T1 | P0 |
| F5 | Identity Platform のリクエストログ | 有効。Google に直接送られたログイン試行も Cloud Logging に残る（P3 でサーバー経由になるまでの、唯一の失敗記録） | T1 | P1 |
| G1 | 既定の Compute Engine サービスアカウント | Editor 権限を外す（使っていなければ無効化） | T6 | P1 |
| G2 | API キーの制限 | Identity Toolkit API と Token Service API だけを許可し、HTTP リファラーを本番ドメインに限定する（P3 でキーを作り直すまでの暫定措置） | T1 | P0 |
| G3 | デプロイ用サービスアカウントの権限 | Cloud Run のデプロイ、Artifact Registry への push、実行用サービスアカウントの指定（actAs）だけ | T5 | P0 |
| G4 | サービスアカウントの鍵 | 鍵ファイルが1つもない（WIF と ADC を使うので不要） | T5 | P0 |
| G5 | Cloud Run の最大インスタンス数 | 小さい値（例: 2〜3）にして、DDoS のときの請求額を抑える | `SecurityPolicy.md` §8 の DDoS | P1 |
| G6 | Artifact Registry | 脆弱性スキャンを有効にし、古いイメージを消すクリーンアップポリシーを設定する | T6 | P1 |
| H1 | `GITHUB_TOKEN` の既定の権限 | read-only | T6 | P0 |
| H2 | fork からの PR のワークフロー | 実行前に承認を必須にする | T6 | P0 |
| H3 | Collaborator、Deploy key、連携アプリ（GitHub Apps / OAuth Apps） | 不要なものがない | T5 | P0 |
| O1 | Slack の Webhook | 通知先のチャンネルが適切か。URL が漏れたら作り直す（`IncidentResponse.md`） | T5 | P0 |

点検は四半期に1回行う。`IaC.md` の Terraform に取り込んだ項目は、自動のずれ検知に置き換える。
