# Security（脅威モデルと対策）

## 1. 判断の原則

- リスクは「起こりやすさ × 被害」で評価する
- 対策の順番は、リスクの大きい順に決める
- 脅威モデリングを使う
- 脆弱性は、CVSS だけで判断せず、次の観点でも判断する
  - 実際に悪用されているか（CISA KEV など）
  - このアプリで実行されうるコードか

## 2. 前提

- 利用する PC は5台以下、スタッフは15名以下
- 利用時間は 6:00〜23:00 JST
- Firebase Auth のアカウントは、人単位ではなく PC 単位
- 新規登録は無効
- ロールはなく、ログインできれば全機能を使える
- ログインには Chrome / Edge のパスワードマネージャーの自動入力を使う
- パスワードは openssl で生成した
- パスワードを変更する機能はない
- 本番は Cloud Run の `*.run.app` で動かす（`.app` ドメインでは HTTPS が常に強制される）
- PC の管理（OS、ブラウザ、メール）は旅館側が行い、このアプリからは手を出せない
- リポジトリは非公開
- 開発には Claude Code を使う
- 開発者は１人

## 3. 守るもの

- 高：宿泊客の個人情報
- 高：GitHub・GCP・Firebase の管理権限
- 低：宿泊税・金庫残高の記録

## 4. 入口（攻撃面）

- Cloud Run の公開 URL
- Identity Toolkit
- Firestore
- 旅館の PC
- GitHub・GCP・Firebase の管理者アカウント
- 依存パッケージ、GitHub Actions
- Git リポジトリ（過去の履歴を含む）
- 開発者の PC

## 5. 想定する攻撃者

- 無差別な自動攻撃
- 業界を狙う犯罪者
- 開発者を狙う攻撃者
- 内部の人
- 嫌がらせ目的の個人

想定しない：国家レベルの攻撃者

## 6. 脅威

- Identity Toolkit へのパスワードの総当たり
- 旅館の PC のマルウェア感染による、パスワードと Cookie の窃取
- 旅館の PC からのパスワードの盗み見・持ち出し
- 旅館の PC からの Session Cookie のコピー
- 開発者の PC のマルウェア感染（TODO: 脅威の解像度を高める）
- GitHub・GCP・Firebase の管理者アカウントの乗っ取り
- 依存パッケージの既知の脆弱性の悪用
- npm パッケージ・GitHub Actions の悪性バージョンの混入
- コードの欠陥
- Git リポジトリへの機密情報・宿泊客の実データの混入

## 7. 対策

- WIF の属性条件による、このリポジトリの `main` ブランチの `deploy.yml` 以外からの GCP への認証の拒否
- デプロイ用の SA への、対象の Cloud Run サービス・Artifact Registry・実行用の SA に限った権限の付与
- `main` への push の CI が成功したときだけのデプロイ
- `main` と `development` のルールセットによる、直接の push・force push・削除の禁止と、PR と CI の全ジョブの合格の必須化
- CI が検査したコミットだけのデプロイ
- WIF の認証ファイルの、Docker イメージとリポジトリからの除外
- 本番へのデプロイと PR の作成の、Slack への通知
- Cloud Run の、専用の SA での実行
- 実行用の SA の権限の、Firestore の読み書きと Session Cookie の発行・失効確認だけへの限定
- Firestore Rules の全拒否による、ブラウザからの Firestore の直接の読み書きの禁止
- Firestore Rules のコードベースの管理
- Emulator 上のテストによるFirestore Rules 全拒否の確認
- ZAP の結果を Issue に書く権限を除いた、CI の権限の読み取りだけへの限定
- GitHub Actions・CI のツール・Docker イメージの版の固定（テストで、タグや版の範囲での指定を検出）
- 公開から7日未満の npm パッケージの版のインストールの禁止
- npm パッケージの install スクリプトの実行の禁止
- Dependabot による、依存の週1回の更新
- CI での、ZAP による動的検査（PR ごとの Baseline と、週1回の全ページ・全 API への能動的な検査）
- CI での、Semgrep による静的解析
- CI での、zizmor による GitHub Actions の定義の検査（Git の認証情報を checkout 後に残さない、危ないトリガーの限定）
- CI での、gitleaks によるリポジトリの全履歴の秘密情報の検査
- 検査の指摘が1件でもあった場合の、CI の失敗
- API と画面の入力への、本番データの最大値の約2〜5倍の上限
- 本番の 400 エラーのレスポンスからの、入力検証の詳細の除外
- ログへの入力の値の出力の禁止
- コードレビューでの、入力の上限・個人情報の出力・実データの貼り付けの確認
- 本番データの匿名化の実行中の、AI エージェントの停止
- `.claude/settings.json` による、AI エージェントの push・gcloud・デプロイ・匿名化のコマンドと、認証情報（`~/.ssh`・gcloud・firebase CLI・`.env*`）の読み取りの拒否、確認を省くモードの無効化、CI の定義の編集の毎回の確認（コマンドの書き方を変えれば抜けられるので、本番への境界は `main` のルールセット）。規則が消されていないことはテストで確認
- Claude Code の Bash のサンドボックス（`.claude/settings.json`）による、AI エージェントのコマンドの通信先の許可リスト化（確認なしは npm と GitHub だけ）、認証情報（上記に加え gh・npm・Docker・Claude の認証情報）の読み取りと CI の定義の書き換えの禁止、サンドボックスの外での実行の禁止。規則が消されていないことはテストで確認（動かすには WSL に bubblewrap と socat が要る。ないと Claude Code が起動しない。読み取りの禁止・書き込みの禁止・通信の拒否が OS のレベルで効くことは 2026-11-10 に確認）
- Firebase Auth の新規登録が、API からも無効であることの確認
- GCP の予算アラートによる、請求額の急な増加の検知
- Cloud runの予算アラートによる、一定額での上限capの作成
- VS Code の Workspace Trust の有効化と、信頼するフォルダーの限定
- VS Code のタスクの自動実行の停止
- github push用のSSH 鍵へのパスフレーズの付与
- GitHub・Google・Slack のアカウントへの、パスキー・二段階認証の登録
- 本番で開発用（Emulator）の設定が残っているときの、アプリの起動の停止
- 開発環境で本番の認証情報や接続先があるときの、アプリの起動の停止
- 開発用のサーバーと Emulator の、自分の PC からだけの接続の許可
- 認証が必要な API ごとの、サーバー側でのセッションの検証（失効の確認を含む）
- 1アカウント1セッション: 新しいログインで前のセッションを使えなくする（ユーザーのカスタムクレーム `sessionAuthTime` に最後のログインの時刻を書き、Session Cookie の `auth_time` と比べる。`revokeRefreshTokens` は新しい Cookie まで失効させるので使わない）と、前のセッションを切ったことの Slack への通知
- Emulator 上のテストによる、失効（`revokeRefreshTokens`）・無効化・削除したユーザーの Session Cookie が直後の API で拒否されることの確認（ログインと同じ秒の `revokeRefreshTokens` は firebase-admin の仕様で効かない。運用では問題にならない）
- ログイン時の、トークンを検証してからのセッションの発行
- ログインのサーバー経由化: ブラウザはメールアドレスとパスワードを `/api/auth/login` に送るだけで、サーバーが Firebase Auth の REST API（`accounts:signInWithPassword`）で確かめる。ブラウザは Firebase を呼ばない（CSP の `connect-src` は `'self'` だけ。`src/` からの `firebase` パッケージの import は ESLint で禁止）。パスワードはログにも Slack にも出さない
- API キーのサーバー専用化: パスワードの確認に使う API キー（`FIREBASE_AUTH_API_KEY`）はサーバーだけが持つ（Secret Manager から Cloud Run に渡す）
- ログインの失敗回数の制限: メールアドレスごと・IP（`X-Forwarded-For` の右端）ごとに数え、3回で1分、4回で5分、5回で15分、6回以降は1時間止める。止めている間は Firebase に送らず 429。存在しないメールアドレスも同じに数える。回数は Firestore の `loginThrottle`（ID は値の SHA-256）。止め始めたら Slack に通知
- ログイン API での、メールアドレス（254文字まで）とパスワード（256文字まで）の長さの確認
- セッション Cookie の、JavaScript からの読み取りと他サイトからの送信の禁止（Emulator の E2E で、属性を外すと読める・送られることの対照実験つきで確認。Secure は本番だけで付くことを integration で確認）
- セッションの期限の、当日の 23:00 まで（22:55 以降のログインは Firebase の最低値の 5 分後まで）への限定
- 営業時間外の、ログインの拒否
- Windowsの Chrome・Edge 以外からの、ログインの拒否
- 指定できる日付の範囲の、過去 100 日・未来 365 日への限定（返すのはその日に関係する予約だけ）
- 宿泊税の一覧の、今月・先月への限定と、表に出す項目だけの返却
- CSP による、許可していないスクリプトの実行と外部への通信の禁止
- 他サイトへの画面の埋め込みの禁止
- セキュリティヘッダーによる、HTTPS の強制・ブラウザ機能の制限・情報の露出の抑制
- API の応答への、nosniff・CORP・`Cache-Control: no-store`（共用の PC のブラウザのキャッシュに宿泊客の情報を残さない）・すべてを禁止する CSP の付与（`next.config.ts`。API は `proxy.ts` の対象外のため）
- エラーやヘッダーからの、内部の詳細や使っている技術の非表示
- CSP の設定の、テストによる意図しない変更の検知
- 本番ビルドの E2E による、セキュリティヘッダー・CSP が目的どおりに攻撃を止めることの確認（ヘッダーを外すと止まらないことの対照実験つき）

## 8. 未実施の対策

### 条件待ち

- デプロイ用の secrets の、Environment `production` への移動：GitHub Pro で可能になった（未着手）
- WIF の属性条件への、Environment `production` の追加：Environment の作成後
- ルールセットと Environment の保護が効いていることの確認：Environment の作成後
- Secret scanning・Push protection の利用可否の確認：同上

### 後回し

- GCP のオーナー権限の、普段使う Google アカウントからの分離
- Slack の Webhook の URL の、作り直しと Secret Manager への移動

### 未着手

- Firestore の PITR・削除保護・定期バックアップの有効化
- SMS による MFA（PC のアカウントごとに業務用の携帯電話を登録）
- Terraform による GCP・GitHub の設定のコード化

## 9. 採用しなかった対策
- 端末登録・IP 登録による、未登録の端末・接続元からのログインの拒否
  - 理由：PC の入れ替えや回線の変更のたびに登録し直す運用の負担が大きく、SMS の MFA のほうが実装も運用も楽なため（2026-11-06 決定）
  - 見直す条件：SMS の MFA が運用に合わないとき
- 前段での Google アカウントによる認証（IAP）
  - 理由：Edge でも使うため、スタッフ用の Google アカウントの運用が必要になる
  - 見直す条件：SMS の MFA が運用に合わないとき、またはスタッフごとのアカウントを作るとき
- Trusted Types
  - 理由：React が自動でエスケープし、`dangerouslySetInnerHTML` も使っていないので効果が小さく、Next.js・MUI・Firebase が動かなくなるおそれがあるため
  - 見直す条件：HTML を直接扱う機能を追加するとき（試すときは Report-Only から始める）
- Cookie の PC のハードウェアへの結び付け（DBSC）
  - 理由：Cookie を数分ごとに更新する仕組みが必要で負担が大きく、対応しているのも Windows 版の Chrome だけのため
  - 見直す条件：セッションの期限を延ばすとき、または内部の人による不正が実際に起きたとき
- gitleaks の commit 前のフックでの実行
  - 理由：CI で止められ、非公開なので push から CI までの間に読まれるおそれが小さいため。フックのために npm の依存を増やしたくない
  - 見直す条件：開発者が増えたとき、またはリポジトリを公開するとき
## 10. 実装と異なる記述（2026-11-03 確認）

- §7「検査の指摘が1件でもあった場合の、CI の失敗」：npm audit は high 以上で、許可リストにないものだけで失敗する（moderate と許可リストの high では失敗しない）
- §8「Secret scanning・Push protection の利用可否の確認：同上」：条件は Environment の作成ではなく GitHub Pro
