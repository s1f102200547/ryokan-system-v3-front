# Ryokan System V3

**客室7部屋の旅館で、スタッフが毎日実際に使っている業務システム。**
要件の聞き取りから設計・実装・運用・セキュリティ設計までを1人で担当しています。

| | |
|---|---|
| できること | 予約の確認・編集、厨房向けタイムテーブルと清掃ボードの印刷、宿泊税の受領管理 |
| 使う人 | 旅館スタッフ約10名（フロントの PC 数台） |
| 状態 | 本番稼働中（Google Cloud Run + Firestore） |
| 守るもの | 宿泊客の個人情報（氏名・連絡履歴・人数・滞在日など） |
| 開発 | 1人。AI エージェント（Claude Code）を使い、**そのエージェント自体も脅威として扱って** 権限を絞っている |

- [1. どんなシステムか](#1-どんなシステムか)
- [2. セキュリティの概要](#2-セキュリティの概要)
- [3. アーキテクチャ](#3-アーキテクチャ)
- [4. テストと検証](#4-テストと検証)
- [5. 技術スタック](#5-技術スタック)
- [6. 詳しいドキュメント](#6-詳しいドキュメント)

---

## 1. どんなシステムか

### 旅館の1日の中で

予約サイト（Booking.com・Expedia など）からの予約メールは、別のシステムが自動で取り込みます。スタッフはこのアプリで次の作業をします。

1. **朝**: その日に到着する予約と、連泊中の予約を確認する
2. **到着前**: 到着時刻、夕食・朝食の時刻、貸切露天風呂の時刻、部屋割りを入力する（入力は自動保存）
3. **夕方**: タイムテーブルを印刷して厨房と共有する。翌日の清掃ボードを印刷する
4. **チェックイン時**: 宿泊税を受け取ったらチェックを付ける。月末に一覧を CSV で出す

同じ部屋・同じ夜に予約が重なっていれば警告を出すなど、紙の運用で起きやすい見落としを画面で防ぎます。

### なぜセキュリティが課題になるのか

- 小さな旅館でも、**宿泊客の個人情報** を扱う
- 宿泊業は、予約サイトを装ったフィッシングや情報窃取マルウェアに狙われやすい
- 専任の IT 担当はおらず、PC の管理は旅館側で、アプリからは手を出せない
- 予算も運用の手間も限られている

そのため「全部守る」ではなく、**何を守り、何に手間をかけ、何をやらないか** を根拠つきで決めることを中心にしました。

---

## 2. セキュリティの概要

### 進め方

| 段階 | やったこと | 文書 |
|---|---|---|
| 脅威モデリング | 守るもの → 入口（攻撃面）→ 想定する攻撃者 → 脅威を洗い出す | [Security.md](docs/Security.md) §2〜6 |
| 優先度付け | 12本の攻撃経路 × 5つの防御フェーズ（入口に届かせない／突破を防ぐ／被害を限定／気付く／戻す）を「リスク × 効き目」で採点し、現状との差で着手順を決める | [SecurityPriority.md](docs/SecurityPriority.md) |
| 正常の定義 | 「普段の使われ方」（時間・端末・ブラウザ・アカウント）を書き出し、そこから外れるものを拒否・検知の対象にする | [NormalOperation.md](docs/NormalOperation.md) |
| 実装と検証 | 対策ごとに「本当に止まるか」をテストで示す。ヘッダーや Cookie 属性は **外すと攻撃が通ることを確かめる対照実験** つき | [Development.md](docs/Development.md) |
| 判断の記録 | 採用しなかった対策も、理由と「見直す条件」を残す | [Security.md](docs/Security.md) §9 |

脆弱性は CVSS の点数だけで判断せず、**実際に悪用されているか（CISA KEV）** と **このアプリで脆弱なコードが実行されうるか** も見ます。

### 主な対策

| 脅威 | 対策 | どう確かめているか |
|---|---|---|
| パスワードの総当たり | ブラウザは Firebase を直接呼ばず、サーバーが代わりにパスワードを確認（数え漏れをなくすため）。メールアドレス別・IP 別に、失敗するほど長く止める（1分 → 5分 → 15分 → 1時間）。同時に大量に送ってもすり抜けないよう、判定をトランザクションで行う | Integration・Emulator テスト |
| Cookie の窃取・悪用 | HttpOnly・SameSite=Strict・Secure。期限は当日 23:00 まで。1アカウント1セッション（新しいログインで前のセッションを無効化し、Slack に通知）。API ごとに失効を確認 | 本物の認証（Auth Emulator）を通す E2E。属性を外すと JS から読める・他サイトから送られることも確認 |
| XSS・データの外部送信 | nonce ベースの CSP（`strict-dynamic`）、通信先は自分のサーバーだけ（`connect-src 'self'`）、埋め込み禁止 | 本番ビルドの E2E で、注入した script・外部への送信・iframe 埋め込みが止まることを確認 |
| 認可の漏れ | 各 API の入口で必ずセッションを検証（画面遷移の制御とは分け、API 側を境界にする） | 全 API の未ログイン 401 テスト、ZAP による未ログインの走査 |
| 不正な入力 | Zod による検証。上限は本番データの最大値の2〜5倍。本番の 400 は検証の詳細を返さない。ログに入力値・個人情報を出さない | Fuzz テスト（全 API に壊れた入力を送り、5xx にならないこと） |
| ブラウザからの DB 直接操作 | Firestore Rules で全拒否。ブラウザ側コードからの Firebase SDK の import を ESLint で禁止 | Emulator 上の Rules テスト |
| 依存パッケージ・Actions の汚染 | Actions は SHA、Docker イメージは digest で固定。公開から7日未満の npm パッケージは入れない。install スクリプトは許可制 | 固定が崩れていないことをテストで検査 |
| デプロイ経路の乗っ取り | 鍵ファイルを使わない Workload Identity Federation。`main` ブランチの `deploy.yml` 以外からは GCP に認証できない。CI が検査したコミットだけをデプロイ。デプロイ用・実行用のサービスアカウントは最小権限 | — |
| 秘密情報・実データの混入 | gitleaks で全履歴を検査。開発用データは許可リスト方式で匿名化。開発環境は Emulator にしか接続できず、本番の鍵があると **起動しない**（逆に本番は開発用設定が残っていると起動しない） | 起動ガードの unit テスト |
| AI エージェント経由の事故・攻撃 | Claude Code を OS レベルのサンドボックスで実行。通信先の許可リスト、認証情報（SSH・gcloud・`.env` など）の読み取り禁止、push・デプロイ・本番データの処理の禁止 | 規則が消されていないことをテストで検査。サンドボックスが実際に効くことも確認済み |
| 想定外の時間・端末からの利用 | 6:00〜23:00 JST 以外はログイン不可。Windows の Chrome・Edge 以外からのログインを拒否 | 3つのタイムゾーンで時刻の境界を検査 |

### CI（PR ごと・`main` / `development` への push ごと）

```mermaid
flowchart LR
  subgraph static["静的検査"]
    lint["lint"]
    tsc["型検査"]
    audit["npm audit"]
    gitleaks["gitleaks<br>全履歴の秘密情報"]
    semgrep["Semgrep<br>静的解析"]
    zizmor["zizmor<br>Actions の定義"]
  end
  static --> unit["Unit / Integration<br>PBT / Fuzz / TZ"]
  unit --> emu[Emulator テスト]
  unit --> e2e[E2E]
  unit --> zap[ZAP Baseline]
```

- 指摘が1件でもあれば CI は失敗し、`main` には入らない（ブランチのルールセットで直接 push・force push を禁止）
- 指摘を除外するときは理由を書く。npm audit の例外には最長3か月の期限を付ける

### 定期的に回している検査と更新

| いつ | 何を |
|---|---|
| 毎週月曜 | **Dependabot**（npm・Actions・Docker）。`development` 宛ての PR で CI を通してから本番へ。公開から7日たった版だけ |
| 毎週月曜 | **ZAP full scan**。本番ビルドを未ログインで、Emulator 環境をログイン済みで、全 API を攻撃する |
| PR ごと | **ZAP Baseline**（`/login` の受け身の検査） |

実際に悪用されている脆弱性（CISA KEV など）だけは、7日を待たずに上げてすぐデプロイする。

### 採用しなかった対策（判断の例）

| 対策 | 採用しなかった理由 |
|---|---|
| 端末・IP の事前登録 | PC の入れ替えや回線の変更のたびに登録し直す負担が大きい。SMS の MFA のほうが実装も運用も軽い |
| 前段での Google アカウント認証（IAP） | Edge でも使うため、スタッフ用の Google アカウントの運用が別に必要になる |
| Trusted Types | React が自動でエスケープし、`dangerouslySetInnerHTML` も使っていないため効果が小さい。ライブラリが動かなくなるおそれがある |
| Cookie の端末への結び付け（DBSC） | Cookie を数分ごとに更新する仕組みが必要で、対応ブラウザも限られる |

どれも「見直す条件」（例: スタッフごとのアカウントを作るとき）を決めてあります。

---

## 3. アーキテクチャ

```mermaid
flowchart LR
  pc["旅館の PC<br>Chrome / Edge"]

  subgraph run["Cloud Run（専用の実行用サービスアカウント）"]
    proxy["proxy.ts<br>CSP nonce・ヘッダー・営業時間"]
    api["API（Route Handlers）<br>セッション検証 → 入力検証"]
    core["application / domain<br>業務ロジック"]
    infra["infra<br>読み取りの検証・正規化"]
  end

  fs[("Firestore")]
  auth["Firebase Auth"]
  gl["gmail-listener<br>予約メールの取り込み（別システム）"]
  slack["Slack<br>障害・ログイン・操作の通知"]

  pc -->|画面| proxy
  pc -->|fetch| api
  api --> core --> infra --> fs
  api -->|パスワード確認・セッション発行| auth
  api --> slack
  gl --> fs
  pc -.->|"直接は不可（Rules で全拒否）"| fs
```

- ブラウザが話すのは自分のサーバーだけ。Firestore・Firebase Auth へはサーバーだけが接続する
- 層は `api → application → domain / infra` の一方向。domain は純粋な TypeScript で、失敗は例外ではなく `Result` 型で返す
- Firestore は別システムと共有していて、過去のシステムが書いた形の崩れたデータも残っている。読み取りは「壊れたデータがあっても落ちない」ように、検証と正規化を infra に集めている

---

## 4. テストと検証

| 種類 | 何を確かめるか |
|---|---|
| Unit | 日付の境界、部屋の状態、予約の更新検証など業務ロジックを最も厚く |
| 制約の突き合わせ | 画面の選択肢・API の検証・DB の読み取りで同じ許容値を使っているか（「保存できたのに読み戻すと消える」を防ぐ） |
| Property-based（fast-check） | 読み取りの正規化・更新の検証が、ランダムな入力でも仕様どおりか |
| Fuzz | 全 API に壊れた入力を送り、500 系にならず、障害通知も飛ばないか |
| タイムゾーン | サーバーは UTC、業務は JST。3つの TZ で同じ結果になるか |
| Emulator | Firestore・Auth Emulator に実際に書いて読み戻す。Rules の全拒否、セッションの失効 |
| E2E（Playwright） | ログイン、予約の編集と自動保存、印刷、宿泊税 |
| E2E（本番ビルド） | セキュリティヘッダー・CSP が攻撃を止めるか（各テストに「そのヘッダーだけ外すと止まらない」対照実験） |
| 構成の固定 | Actions・Docker イメージ・ツールの版が固定されているか、AI エージェントの制限が残っているか |

---

## 5. 技術スタック

| 分類 | 使っているもの |
|---|---|
| フロント・サーバー | Next.js 16（App Router）、React 19、MUI 9、TypeScript（strict） |
| データ・認証 | Firestore、Firebase Auth（firebase-admin でサーバーからだけ利用） |
| 検証 | Zod 4 |
| テスト | Vitest、fast-check、Playwright、Firebase Emulator |
| セキュリティ検査 | OWASP ZAP、Semgrep、gitleaks、zizmor、npm audit、Dependabot |
| インフラ | Cloud Run、Artifact Registry、Secret Manager、Workload Identity Federation、GitHub Actions |
| 通知・監視 | Cloud Logging、Slack |

---

## 6. 詳しいドキュメント

| 文書 | 内容 |
|---|---|
| [docs/Security.md](docs/Security.md) | 脅威モデル、実装済みの対策、採用しなかった対策と理由 |
| [docs/SecurityPriority.md](docs/SecurityPriority.md) | 攻撃経路 × 防御フェーズの優先度評価 |
| [docs/NormalOperation.md](docs/NormalOperation.md) | 正常な使われ方の定義と、それを強制する方法 |
| [docs/Domain.md](docs/Domain.md) | 業務用語、画面と API、データ構造、計算のルール |
| [docs/Development.md](docs/Development.md) | ローカル開発、テスト、CI/CD、デプロイ、依存の管理 |
| [AGENTS.md](AGENTS.md) | 開発ルール（AI エージェント向けの指示を兼ねる） |

### ローカルで動かす

本番には接続しません。Firebase Emulator と人工のテストデータだけで動きます（Node、Java、firebase-tools が必要）。

```bash
cp .env.development.example .env.development
make   # → http://127.0.0.1:3000（dev@example.com / dev-password）
```

## License

[MIT](LICENSE)
