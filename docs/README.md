# ドキュメント一覧（2026-11-03 時点）

2026-11-03 に、このファイル・`docs/Security.md`・`CLAUDE.md` 以外の md を削除し、`AGENTS.md` の中身を空にした。下の表は削除前の構成と中身の概要。削除したファイルは、コミット `8418553` から `git show 8418553:<パス>` で読める。

## 構成

```
./
├── AGENTS.md              # （中身を削除）
├── CLAUDE.md              # AGENTS.md を読み込む（@AGENTS.md）
├── GCP_SETUP.md
├── docs/
│   ├── README.md          # このファイル
│   ├── Architecture.md
│   ├── BugHunting.md
│   ├── CICD.md
│   ├── Context7.md
│   ├── ErrorHandling.md
│   ├── KnownIssues.md
│   ├── LocalDevelopment.md
│   ├── Review.md
│   ├── Security.md        # 残す
│   ├── Test.md
│   └── Schema/            # Firestore のコレクションの定義
│       ├── Daily.md
│       └── Reservations.md
└── tests/fixtures/localdev/
    └── README.md
```

## 中身の概要

### ルート

| ファイル | 概要 |
|---|---|
| `AGENTS.md` | AI エージェント向けのプロジェクトの規則。概要（7部屋の旅館の業務アプリ）、技術スタックと版、実装の順番、層の構成、CI/CD、セキュリティ、テスト、エラー処理、スキーマの要点 |
| `CLAUDE.md` | `@AGENTS.md` の1行だけ |
| `GCP_SETUP.md` | CI/CD の初回セットアップ手順。API の有効化、Artifact Registry、デプロイ用 SA と対象リソースだけへの権限、実行用 SA（`ryokan-runtime`、カスタムロール）、匿名化用の閲覧専用 SA、Workload Identity Federation と属性条件、GitHub Secrets、動作確認 |

### `docs/`

| ファイル | 概要 |
|---|---|
| `Architecture.md` | 層の構成（UI → Route Handler → Application → Domain + Infra）、層ごとの import の規則、`src/` と `tests/` のファイル構造、Route Handler・Domain/Infra・UI の責務 |
| `BugHunting.md` | バグを探すための方針。リスクマップ、手法（往復検査、制約の突き合わせ、ファジング、TZ の固定テスト、PBT、実機確認、状態遷移）、再発防止の横展開、見つけた課題 28 件と対応、仕様として決めたこと、残っていること |
| `CICD.md` | CI のジョブと依存、権限、版の固定、`.npmrc`（7日待ち・install スクリプトの制限）、Dependabot と Slack の通知、audit の例外リスト、Semgrep、ZAP、Deploy の流れと Cloud Run の設定、Secrets、Docker の構成 |
| `Context7.md` | Context7 で最新の公式ドキュメントを確かめる場面と手順、ライブラリごとの既知の ID と版、query の書き方 |
| `ErrorHandling.md` | 層ごとのエラー処理の方針、`InfraErrorCode` と HTTP status・Slack 通知の対応、認証エラーの分類、400 で検証の詳細を返さないこと、壊れた予約の読み飛ばし、ログレベル |
| `KnownIssues.md` | 既知の問題。npm audit の moderate と Dependabot の警告、日付の書式の混在、1/0 と真偽値の混在、汚い DB データ、同時編集の上書き、部屋未割り当ての表示、Slack 通知の失敗に気付けないこと、audit の high の例外など |
| `LocalDevelopment.md` | Firebase Emulator だけに接続するローカル開発の仕様。開発・本番の起動ガード（DEV / PROD）、本番データの匿名化（ANON。許可リスト方式の変換規則、形・大きさのレポート）、Emulator への投入（SEED）、運用（OPS）、受容するリスク、受け入れ基準と確認状況、実装の構成と環境変数 |
| `Review.md` | push 前のコードレビューの観点（業務ロジック、層の規則、エラー処理、セキュリティ、UI/UX、テスト、運用、ドキュメント）と実行するコマンド |
| `Security.md` | 脅威モデルと対策。判断の原則、前提、守るもの、入口、想定する攻撃者、脅威、実施した対策、未実施の対策、採用しなかった対策、実装と異なる記述 |
| `Test.md` | テストの種類と役割（unit / integration / Emulator / TZ / PBT / fuzzing / E2E）、コマンド、各テストで確かめる観点、E2E で実際の認証情報を使わない方針、テストデータ |

### `docs/Schema/`

| ファイル | 概要 |
|---|---|
| `Daily.md` | `dailyInfo/{YYYY-MM-DD}` のフィールド（todos、safeBalanceChecker など）と検証の規則 |
| `Reservations.md` | `guestInfoV2` のフィールド（基本、画面で編集する泊別の配列、手動追加・操作履歴）、日付の書式、読み取り時の正規化、書き込み時の検査（許容値、文字数・件数の上限、日付の範囲、トランザクションでの整合の検査）、`MailMemoEntry` の構造 |

### `tests/fixtures/localdev/`

| ファイル | 概要 |
|---|---|
| `README.md` | `npm run seed -- --fixture` で Emulator に入れる人工データの説明。本番データの「形」（型違い、`''` と `null`、破損日付、配列の長さ違いなど）をわざと含める |
