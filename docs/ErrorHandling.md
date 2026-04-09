# Error Handling Policy

## 概要

- このドキュメントはエラー処理の方針を層ごとに定義する。
- 外部エラーを `InfraError` に変換し、層を越えるごとに抽象度を上げて伝搬させる。
- Domain 層は `Result` 型、Infra 層は `InfraError` の throw、で使い分ける。

---

## 前提: 本プロジェクトの特性

| 特性 | 影響 |
|---|---|
| Firestore が唯一の外部DB | Infra 層のエラー源はほぼ Firestore と Firebase Auth |
| 7部屋・小規模運用 | 大量トランザクションの競合は起きにくい。リトライは控えめでよい |
| UI | エラー時に「何をすべきか」を日本語で端的に伝える必要がある |

---

## 1. 層ごとのエラー処理方針

### 概要図

```
UI層（components/）
  表示専用。エラーメッセージをそのまま表示する
  ↑ string（日本語メッセージ）
  │
Hooks層（hooks/）
  HTTP ステータス → ユーザー向け日本語メッセージに変換
  ↑ HTTPレスポンス
  │
Route Handler（app/api/）
  InfraError → HTTP ステータスに変換。構造化ログ出力。Slack 通知。
  ↑ throw InfraError
  │
Application層（application/）
  何もしない。エラーをそのまま伝搬する。
  ↑ throw InfraError
  │
Domain層（domain/）
  例外を投げない。Result 型で返す。
  ↑ throw InfraError
  │
Infra層（infra/）
  外部エラー（Firebase/gRPC/ZodError）を InfraError に変換して throw する。
```

---

### 1-1. Infra層 — 外部エラーを InfraError に変換

外部ライブラリ固有のエラーをそのまま上位に伝えない。必ず `InfraError` に変換して throw する。

**`InfraErrorCode` の種類:**

| コード | 発生源 | 意味 |
|---|---|---|
| `AUTH_UNAVAILABLE` | Firebase Auth（ネットワーク断・レート制限等） | インフラ障害 |
| `FIRESTORE_UNAVAILABLE` | gRPC code=14 | Firestore 接続不能 |
| `FIRESTORE_PERMISSION` | gRPC code=7 | IAM 権限設定ミス |
| `FIRESTORE_DATA_CORRUPTION` | ZodError（DB 読み取り時） | DB内データがスキーマ不一致（データ破損） |

**認証失敗（パスワード違い等）は `InfraError` にしない。**
Firebase の `auth/wrong-password` / `auth/invalid-credential` 等は「ビジネス結果」として `{ success: false }` を返す。
インフラ障害（ネットワーク断・レート制限等）のみ `InfraError('AUTH_UNAVAILABLE')` を throw する。

---

### 1-2. Domain層 — 例外を投げない。Result 型で返す

```typescript
// ビジネスルールの失敗は Result 型で表現する
type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E }
```

---

### 1-3. Application層 — 何もしない

エラーをそのまま伝搬する。catch しない。
書き込み系 Command を追加する場合のみ、部分成功の巻き戻し処理をここに書く（現在は読み取りのみなので該当なし）。

---

### 1-4. Route Handler — HTTP 変換 + ログ + Slack 通知

`InfraError.code` → HTTP ステータスコードへ変換し、ログ出力と Slack 通知を行う。

**マッピング表:**

| InfraErrorCode | HTTP | ログ | Slack通知 |
|---|---|---|---|
| `FIRESTORE_UNAVAILABLE` | 503 | ERROR | ✅ |
| `FIRESTORE_PERMISSION` | 500 | ERROR | ✅ |
| `FIRESTORE_DATA_CORRUPTION` | 500 | ERROR | ✅ |
| `AUTH_FAILED` | 401 | — | ❌ |
| `AUTH_UNAVAILABLE` | 503 | ERROR | ❌ |
| 想定外エラー（非 InfraError） | 500 | ERROR | ✅ |
| Zod parse failure（リクエスト） | 400 | — | ❌ |

**Slack 通知の基準:** 「人が対応しなければ直らない」エラーのみ通知する。ユーザーが再試行すれば解決する可能性のあるものは通知しない。

---

### 1-5. Hooks層 — HTTP ステータス → 日本語メッセージ

**ログイン画面（公開ページ）:**

| 状況 | メッセージ | 備考 |
|---|---|---|
| 401 | メールアドレスまたはパスワードが正しくありません | 入力ミスを具体的に伝える |
| 500 / 503 | サービスが一時的に利用できません。しばらくお待ちください | 監視インフラの存在を公開しない |
| fetch 失敗 | 通信エラーが発生しました。ネットワーク接続を確認してください | レスポンスが存在しない |

> ログイン画面は公開ページのため、503 と 500 を区別しない。「管理者に通知済みです」のような表現も使わない（監視インフラの存在を悪意あるユーザーに公開しないため、あえて曖昧な表現にする）。

**清掃ボード画面（認証済みスタッフ向け）:**

| 状況 | メッセージ | 備考 |
|---|---|---|
| 503 | 一時的に通信に失敗しました。しばらく待ってから再度お試しください。 | リトライで解決するためユーザーにアクションを促す |
| その他 | データの取得に失敗しました。管理者に通知済みです。 | 管理者が対応することを伝え、ユーザーを安心させる |
| fetch 失敗 | 通信エラーが発生しました。ネットワーク接続を確認してください | レスポンスが存在しない |

---

## 2. バリデーション戦略

| 境界 | 方向 | 手法 |
|---|---|---|
| フロント → API | リクエスト受信時 | Zod（Route Handler 冒頭） |
| Firestore → Infra | DB 読み取り後 | Zod（Infra 内）。失敗は `FIRESTORE_DATA_CORRUPTION` |
| API → フロント | レスポンス受信後 | 型アサーション（`as Promise<T>`） |

---

## 3. ログ戦略

### 3-1. ログレベルの定義

| レベル | 用途 | 例 |
|---|---|---|
| `ERROR` | 処理が完了できなかった | Firestore 接続失敗、想定外エラー |
| `WARN` | 処理は完了したが異常がある | パスワード違いによるログイン失敗 |
| `INFO` | 正常な重要イベント | ログイン成功 |

Cloud Run の stdout に JSON 形式で出力し、Cloud Logging に自動収集する。

### 3-2. Slack 通知

`SLACK_WEBHOOK_URL` 環境変数で設定。未設定の場合：
- **production**: `logger.warn` で警告を出してスキップ
- **dev/test**: 静かにスキップ

Slack 通知が失敗した場合は `logger.error` にフォールバックする（fire-and-forget）。

---

## 4. やらないこと

| パターン | 理由 |
|---|---|
| グローバル Error Boundary（React） | ページ数が少なく、各ページで個別対応の方が適切 |
| カスタム例外の深い継承階層 | `InfraError` 1クラス + `code` フィールドで十分 |
| 全 API レスポンスの Zod 検証 | 自分の API なので型アサーションで十分。外部 API 連携時に導入 |
| Sentry 等の外部エラー監視 | Cloud Logging + Slack 通知で現時点は十分。規模拡大時に検討 |

---

## 5. 注意事項

- gRPC コード（14, 7）はマジックナンバーのため、必ずコメントで意味を明記する
- `notifySlackFireAndForget` は必ず fire-and-forget で使う（`await` しない）
- 新しい `InfraErrorCode` を追加した際は `infraErrorToHttpStatus.ts` の `switch` がコンパイルエラーになる（網羅性チェック）

---

