# 設定のコード化（IaC）

コンソールでの手作業は、変更の記録が残らず、知らないうちに設定がずれる。設定をコードにして、次の効果を得る。

- 設定の変更が PR になり、レビューと履歴（いつ・何を）が残る
- コンソールで誰かが手で変えても、差分として検知できる
- 環境を作り直すときや、staging を作るときに同じ設定を再現できる（`docs/KnownIssues.md` の「staging 環境がない」にも効く）

| 段階 | 対象 | 方法 |
|---|---|---|
| 1（P1 に含まれる） | Firestore Rules、Cloud Run の設定（サービスアカウント、最大インスタンス数、secrets）、Dependabot、npm の設定、ZAP の除外ルール | リポジトリ内のファイル（`firestore.rules`、`deploy.yml` の flags、`.github/dependabot.yml`、`.npmrc`、ZAP の rules ファイル） |
| 2（P5） | GCP と Firebase（`Checklist.md` の F・G、T5 の WIF・IAM・サービスアカウント、`Detection.md` のアラート、予算） | Terraform。既存のリソースは `import` ブロックで取り込む（作り直さない）。state はバージョニングを有効にした GCS バケットに置く |
| 3（任意） | GitHub の設定（ルールセット、Environment、Actions の権限など） | Terraform の `integrations/github` provider。項目が少ないので、四半期ごとの手作業の点検で済ませてもよい |

- **ずれの自動検知**: GitHub Actions で週1回、読み取り専用のサービスアカウントで `terraform plan -detailed-exitcode` を実行し、差分があれば通知する。
- Identity Platform の一部の項目（新規登録の無効化、メール列挙保護、リクエストログ）を Terraform provider がどこまで扱えるかは要確認。
- **コード化できないもの**: アカウント自体の 2FA / パスキー、Terraform の state バケットと Terraform 用アカウントの最初の作成、`Checklist.md` の F2・G4 の「中身」の確認。
