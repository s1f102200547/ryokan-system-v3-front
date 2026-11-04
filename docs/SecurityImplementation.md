# Security 対策の実装手順

## A. Claude Code で完結できるもの

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
  - GitHub のルールセットで `main` を守った（2026-11-04）。Claude が push できても、PR と CI を通らないと本番に届かない
- [ ] ログインの失敗回数の制限
  - メモ: 今はブラウザが Identity Toolkit を直接呼ぶので、アプリは失敗を数えられない。「ログインのサーバー経由化」（B）の後に行う

### §10 実装と異なる記述

実装を記述に合わせるか、記述を実装に合わせるかを決めてから行う。

- [x] §7「参照できる日付の範囲の、過去 100 日・未来 365 日への限定」：宿泊税テーブルの API（`/api/a-tax-table`）は 2020〜2099 年の任意の月を読める。guest-info などは指定日の前後 30 日の C/I も読む
  - 宿泊税の API は JST の今月・先月だけを受け付け、行は表に出す項目だけを返すようにした（2026-11-04。`src/lib/aTaxMonths.ts`）
  - guest-info などは実装を変えない（指定できる日付は範囲内。前後 30 日の検索は滞在中の予約を探すためで、返すのはその日に関係する予約だけ）。Security.md §7 の文言を実装に合わせ、§10 から削除した
- [x] §7「セッションの期限の、当日の 23:00 までへの限定」：Firebase の最低値に合わせて期限を最短 5 分にしているので、22:55 以降のログインでは最長 23:05 まで有効になる
  - 実装は変えず、Security.md §7 と `src/constants/date.ts` のコメントを実装に合わせた（2026-11-04）。厳密に 23:00 で切る必要はないと判断


## B. Claude Code だけでは完結しないもの

### §8 条件待ち

- [x] `main` と `development` のルールセットによる保護（PR・CI 合格の必須化、force push と削除の禁止）：GitHub Pro 待ち
  - 作成済み（2026-11-04、ルールセット `protect-main-dev`、Active、bypass なし）。PR 必須（承認数 0。開発者が1人のため）、CI の9ジョブ（Lint・Type Check・npm audit・Secret Scan・Semgrep・Unit Test・Emulator Round-trip Test・E2E Test・OWASP ZAP Baseline Scan）の合格を必須、force push と削除を禁止
  - 9ジョブすべてを必須にするのは、前のジョブが落ちて後ろがスキップされると、スキップは合格として扱われるため
  - 「最新の状態でのマージ」と linear history は使わない（Dependabot の PR のたびに CI のやり直しが要る／merge commit で取り込んでいるため）
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
