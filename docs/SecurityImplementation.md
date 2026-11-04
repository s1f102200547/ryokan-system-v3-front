# Security 対策の実装手順

[Security.md](Security.md) の §8（未実施の対策）と §10（実装と異なる記述）を、このブランチで実装していくための作業一覧。項目の文言は Security.md からそのまま写している。終わったら `[x]` にし、Security.md の該当箇所（§7 への移動、§8・§10 からの削除）を更新する。

前提の変化: GitHub Education が通り、GitHub Pro が使える（2026-11-03）。§8「条件待ち」の「GitHub Pro 待ち」は解消した。

## A. Claude Code で完結できるもの

コードとリポジトリ内のファイルの変更だけで終わり、テストで確かめられるもの。

### §8 後回し

- [x] `firebase-admin` の 14 への更新
  - 14.5.0 に更新（2026-11-04）。トークン・セッション Cookie のエラーの code と message は 13.10 と同じで、ログインの 401 / 503 の判定は変えずに済んだ。`uuid` の moderate は消え、代わりに `glob` の moderate が1件増えた（docs/Development.md）
- [x] Node.js の 26 LTS への更新：2027 年中
  - Node 26.13.0（LTS）に更新（2026-11-04）。Dockerfile の3つの FROM（digest 固定）、CI の `node-version`、`@types/node` をそろえた

### §8 未着手

- [x] ログイン成功時の接続元 IP の、Slack への通知
  - 実装済み（`src/lib/auth/loginNotice.ts`、ログイン API）。ログインのたびに通知し、Cloud Logging にも INFO で残す
- [x] AI エージェントの権限の制限（push、デプロイ、認証情報の読み取りの拒否）
  - 実装済み（`.claude/settings.json`）: push・gcloud・firebase deploy/login・gh・匿名化などのコマンド、`~/.ssh`・gcloud・firebase CLI の認証情報・`.env*`・`.localdev/` の読み取りを拒否。bypass モードを無効化。`.github/workflows/**` の編集は毎回確認
  - 限界: Bash の deny は書き方を変えると抜けられる（`bash -c 'git push'`、`git -C . push`、スクリプトからのファイル読み取り）。うっかりを止める層で、境界ではない
  - 残り: GitHub のルールセットで `main` を守る（§8 条件待ち。push されても本番に届かなくする）。
- [ ] ログインの失敗回数の制限
  - メモ: 今はブラウザが Identity Toolkit を直接呼ぶので、アプリは失敗を数えられない。「ログインのサーバー経由化」（B）の後に行う
- [ ] ログイン API での、パスワードの長さの確認
  - メモ: 今のログイン API は idToken を受け取り、パスワードを見ない。「ログインのサーバー経由化」（B）の後に行う

### §10 実装と異なる記述

実装を記述に合わせるか、記述を実装に合わせるかを決めてから行う。

- [ ] §7「参照できる日付の範囲の、過去 100 日・未来 365 日への限定」：宿泊税テーブルの API（`/api/a-tax-table`）は 2020〜2099 年の任意の月を読める。guest-info などは指定日の前後 30 日の C/I も読む
- [ ] §7「セッションの期限の、当日の 23:00 までへの限定」：Firebase の最低値に合わせて期限を最短 5 分にしているので、22:55 以降のログインでは最長 23:05 まで有効になる


## B. Claude Code だけでは完結しないもの

GitHub・GCP・Firebase・Slack の管理画面や本番での操作、人の判断、旅館の PC での作業が要るもの。Claude Code は、コード・ワークフロー・コマンド・手順の用意までを行い、本番や管理画面の設定は人が行う。

### §8 条件待ち

- [ ] `main` と `development` のルールセットによる保護（PR・CI 合格の必須化、force push と削除の禁止）：GitHub Pro 待ち
  - 人: GitHub の Settings → Rules で作成。Claude: 必須にする CI のジョブ名の一覧と設定内容を用意
- [ ] デプロイ用の secrets の、Environment `production` への移動：GitHub Pro 待ち
  - 人: Environment の作成と secrets の移動。Claude: `deploy.yml` に `environment: production` を追加
- [ ] WIF の属性条件への、Environment `production` の追加：Environment の作成後
  - 人: `gcloud iam workload-identity-pools providers update-oidc` を実行。Claude: コマンドを用意
- [ ] 上記の保護が効いていることの確認：同上
  - 人: 直接 push・force push・CI 失敗の PR のマージ・別ブランチからの GCP 認証が拒否されることを確かめる
- [ ] Secret scanning・Push protection の利用可否の確認：同上
  - 人: Settings → Code security で、非公開リポジトリで使えるか確かめる

### §8 後回し

- [ ] GCP のオーナー権限の、普段使う Google アカウントからの分離
- [x] GitHub・Google・firebase・slack のアカウントへのパスキー・二段階認証の登録
- [ ] Slack の Webhook の URL の、作り直しと Secret Manager への移動
  - 人: Webhook の作り直し、Secret Manager への登録、実行用 SA への読み取り権限の付与、古い URL の無効化。Claude: `deploy.yml` を Secret Manager の参照に変更
- [x] Dependabot の既存の警告の再分析：残りの対策の実装後
  - Claude: 警告の内容と、このアプリで脆弱なコードが動くかの分析。人: Dismiss するかの判断と操作

### §8 未着手

- [ ] Firestore の PITR・削除保護・定期バックアップの有効化
  - 人: 本番の GCP で `gcloud firestore databases update` などを実行。Claude: コマンドと、費用・保持期間の確認事項を用意
- [ ] 端末登録による、未登録の端末からのログインの拒否
  - 人: 方式の決定、旅館の PC への登録作業。Claude: 方式の案と実装
- [ ] ログインのサーバー経由化と、API キーのサーバー専用化
  - Claude: ログイン API でパスワードを受け取り、サーバーから Identity Toolkit を呼ぶ実装（CSP の `connect-src` も狭める）。人: API キーの制限（GCP の認証情報の画面）と、サーバー用のキーの配置
- [ ] Terraform による GCP・GitHub の設定のコード化
  - Claude: Terraform のコード。人: 既存リソースの import と apply（本番の権限が要る）
