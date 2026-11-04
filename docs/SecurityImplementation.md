# Security 対策の実装手順

## A. Claude Code で完結できるもの

### §8 未着手

- [ ] ログインの失敗回数の制限
  - メモ: 今はブラウザが Identity Toolkit を直接呼ぶので、アプリは失敗を数えられない。「ログインのサーバー経由化」（B）の後に行う

## B. Claude Code だけでは完結しないもの

### §8 条件待ち

- [ ] デプロイ用の secrets の、Environment `production` への移動：GitHub Pro で可能になった（未着手）
  - 人: Environment の作成と secrets の移動。Claude: `deploy.yml` に `environment: production` を追加
- [ ] WIF の属性条件への、Environment `production` の追加：Environment の作成後
  - 人: `gcloud iam workload-identity-pools providers update-oidc` を実行。Claude: コマンドを用意
- [ ] 上記の保護が効いていることの確認：同上
  - 人: 直接 push・force push・CI 失敗の PR のマージ・別ブランチからの GCP 認証が拒否されることを確かめる
- [ ] Secret scanning・Push protection の利用可否の確認：同上
  - 人: Settings → Code security で、非公開リポジトリで使えるか確かめる

### §8 後回し

- [ ] GCP のオーナー権限の、普段使う Google アカウントからの分離
- [ ] Slack の Webhook の URL の、作り直しと Secret Manager への移動
  - 人: Webhook の作り直し、Secret Manager への登録、実行用 SA への読み取り権限の付与、古い URL の無効化。Claude: `deploy.yml` を Secret Manager の参照に変更

### §8 未着手

- [ ] Firestore の PITR・削除保護・定期バックアップの有効化
  - 人: 本番の GCP で `gcloud firestore databases update` などを実行。Claude: コマンドと、費用・保持期間の確認事項を用意
- [ ] 端末登録による、未登録の端末からのログインの拒否
  - 人: 方式の決定、旅館の PC への登録作業。Claude: 方式の案と実装
- [ ] ログインのサーバー経由化と、API キーのサーバー専用化
  - Claude: ログイン API でパスワードを受け取り、サーバーから Identity Toolkit を呼ぶ実装（CSP の `connect-src` も狭める）。人: API キーの制限（GCP の認証情報の画面）と、サーバー用のキーの配置
- [ ] Terraform による GCP・GitHub の設定のコード化
  - Claude: Terraform のコード。人: 既存リソースの import と apply（本番の権限が要る）
