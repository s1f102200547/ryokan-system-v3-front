# Security Policy（脅威モデル）

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
- CI が検査したコミットだけのデプロイ
- WIF の認証ファイルの、Docker イメージとリポジトリからの除外
- 本番へのデプロイと PR の作成の、Slack への通知
- Cloud Run の、専用の SA での実行
- 実行用の SA の権限の、Firestore の読み書きと Session Cookie の発行・失効確認だけへの限定
- Firestore Rules の全拒否による、ブラウザからの Firestore の直接の読み書きの禁止
- Firestore Rules のコードベースの管理
- Emulator 上のテストによるFirestore Rules 全拒否の確認
- ZAP の結果を Issue に書く権限を除いた、CI の権限の読み取りだけへの限定
- GitHub Actions・CI のツール・Docker イメージの版の固定
- Node.js などの実行環境の、サポート期間内の版への更新
- 公開から7日未満の npm パッケージの版のインストールの禁止
- npm パッケージの install スクリプトの実行の禁止
- Dependabot による、依存の週1回の更新
- 悪用が報告された脆弱性の、7日を待たない修正
- CI での、ZAP による動的検査
- CI での、Semgrep による静的解析
- CI での、gitleaks によるリポジトリの全履歴の秘密情報の検査
- 検査の指摘が1件でもあった場合の、CI の失敗
- API と画面の入力への、本番データの最大値の約2〜5倍の上限
- 本番の 400 エラーのレスポンスからの、入力検証の詳細の除外
- ログへの入力の値の出力の禁止
- コードレビューでの、入力の上限・個人情報の出力・実データの貼り付けの確認
- 本番データの匿名化の実行中の、AI エージェントの停止
- Firebase Auth の新規登録が、API からも無効であることの確認
- GCP の予算アラートによる、請求額の急な増加の検知
- Cloud runの予算アラートによる、一定額での上限capの作成
- VS Code の Workspace Trust の有効化と、信頼するフォルダーの限定
- VS Code のタスクの自動実行の停止
- github push用のSSH 鍵へのパスフレーズの付与
- 素性の分からないリポジトリの、Dev Container か Codespaces での利用
## 8. 未実施の対策

### 条件がそろうのを待っているもの

- `main` と `development` のルールセットによる保護（PR と CI の全ジョブの合格の必須化、force push と削除の禁止、バイパスなし。必須チェックに `Secret Scan` と `Semgrep` も加える）：GitHub Pro 待ち
- デプロイ用の secrets の、`main` だけが使える Environment `production` への移動（ほかのブランチのワークフローから読めなくする）：GitHub Pro 待ち
- WIF の属性条件への `assertion.environment == 'production'` の追加：Environment を作ったあと
- 上の2つの確認（`main` への直接 push が拒否されること、ほかのブランチに置いた確認用のワークフローが GCP の認証に失敗すること）：同上
- GitHub Pro での Secret scanning・Push protection が使えるかの確認：同上
- リポジトリを公開に切り替える前の、gitleaks によるリポジトリの全履歴の検査：公開するとき

### 後回しにしたもの

- 普段使う Google アカウントからの GCP のオーナー権限の除去（オーナーは別のアカウントにし、別のブラウザのプロファイルでだけ使う）
- GitHub・普段の Google・オーナー用の Google のアカウントへのパスキーの登録
- Slack の Webhook の URL の、Secret Manager への移動と作り直し（今は Cloud Run の環境変数に平文で入っている。2026-11-02 に値が AI エージェントとの会話に渡った）
- `firebase-admin` の 13 から 14 への更新（内部の `uuid@9` の moderate の脆弱性が消える）
- 今ある Dependabot の警告4件（uuid、grpc-js ×2、minimatch）の分析のやり直しと、Dismiss するかの判断：残りの対策を実装し終えてから
- Node.js の 26 LTS への更新：2027 年中

### 未着手のもの

- ログインに成功したときの接続元 IP の、Slack への通知（数週間観察し、旅館の IP が固定なら IP 制限を検討する）
- AI エージェントの権限の設定による制限（`.claude/settings.json` の `permissions.deny` で `git push`、`gcloud`、`firebase deploy`、`~/.ssh`・`~/.config/gcloud` の読み取りを拒否する）
- Firestore の PITR（過去の時点への復元）・削除保護・定期バックアップの有効化
- 端末登録（登録した端末の Cookie がなければ、パスワードを見る前にログインを拒否する。初回利用時の自動登録、同じ IP からの新しいブラウザの自動登録と Slack 通知、違う IP の未登録のブラウザの拒否と Slack 通知）
- ログインのサーバー経由化（Google への問い合わせをサーバーが行う。API キーを作り直してサーバー専用にし、`firebase` パッケージを削除して、CSP と audit の例外を整理する）
- ログインの失敗回数の制限（アカウントごと・端末ごとに連続5回まで。超えたら15分待たせ、繰り返すたびに延ばす。IP ごとに1時間で20回を超えたら Slack に通知する）
- ログイン API の入力検証による、パスワードの長さ（10〜100）の確認（範囲外は Google に問い合わせずに、通常の失敗と同じメッセージで拒否する）
- Terraform による GCP・GitHub の設定のコード化と、ずれの自動検知
- （任意）スタッフへの周知：「Web ページが『何かを貼り付けて実行して』と言ってきたら、攻撃」

順番：端末登録をログインのサーバー経由化より先に行う。端末登録はセッション Cookie を発行するログイン API で確認するので、サーバー経由化しなくても効き、パスワードの窃取・盗み見・持ち出しにまとめて効く。サーバー経由化の主な効果は試行回数の制限で、強いパスワードを使っている今は効果が比較的小さい。
