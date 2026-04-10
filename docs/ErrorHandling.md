# Error Handling Policy

## 基本方針

- 外部エラーを `InfraError` に変換し、層を越えるごとに抽象度を上げて伝搬させる
- Domain 層は `Result` 型、Infra 層は `InfraError` の throw、で使い分ける
- 発生したエラーは途中で握りつぶされないようにする
---

## 層ごとの責務

```
UI層
  エラーメッセージをそのまま表示する
  ↑ string（日本語メッセージ）

Hooks層
  HTTP ステータス → ユーザー向け日本語メッセージに変換する
  ↑ HTTPレスポンス

Route Handler
  InfraError → HTTP ステータスに変換。ログ出力。必要に応じて Slack 通知。
  ↑ throw InfraError

Application層
  エラーをそのまま伝搬する（catch しない）
  ↑ throw InfraError

Domain層
  例外を投げない。Result 型で返す。

Infra層
  外部エラー（Firebase / gRPC / ZodError）を InfraError に変換して throw する。
```

---

## InfraErrorCode

| コード | 発生源 | HTTP | Slack通知 |
|---|---|---|---|
| `FIRESTORE_UNAVAILABLE` | gRPC code=14 | 503 | ✅ |
| `FIRESTORE_PERMISSION` | gRPC code=7 | 500 | ✅ |
| `FIRESTORE_DATA_CORRUPTION` | ZodError（DB 読み取り時） | 500 | ✅ |
| `AUTH_UNAVAILABLE` | Firebase Auth インフラ障害 | 503 | ✅ |
| `AUTH_FAILED` | 認証失敗（パスワード違い等） | 401 | ❌ |

**新しい `InfraErrorCode` を追加したら `infraErrorToHttpStatus.ts` の `switch` を必ず更新すること**（網羅性チェックにより漏れるとコンパイルエラーになる）。

---

## 認証エラーの分類

Firebase のエラーは「ビジネス結果」と「インフラ障害」を必ず分離する。

- `auth/wrong-password`, `auth/invalid-credential` 等 → ビジネス結果。`{ success: false }` を返す or `AUTH_FAILED`
- ネットワーク断・レート制限・内部エラー等 → `InfraError('AUTH_UNAVAILABLE')` を throw する

---

## ユーザー向けメッセージの原則

| 画面種別 | 方針 |
|---|---|
| 公開ページ（ログイン等） | 500/503 を区別しない。監視インフラの存在を公開しない |
| 認証済みページ | 503 はリトライを促す。それ以外は「管理者に通知済み」と伝え安心させる |
| 共通 | fetch 失敗（ネットワーク断）は別メッセージで案内する |

---

## Slack 通知の基準

「人が対応しなければ直らない」エラーのみ通知する。ユーザーが再試行すれば解決する可能性のあるものは通知しない。

`notifySlackFireAndForget` は必ず fire-and-forget で使う（`await` しない）。

---

## ログレベル

| レベル | 用途 |
|---|---|
| `ERROR` | 処理が完了できなかった（Firestore 障害・想定外エラー等） |
| `WARN` | 処理は完了したが異常がある（認証失敗・想定外 Cookie 等） |
| `INFO` | 正常な重要イベント（ログイン成功等） |

---

## バリデーション

| 境界 | 手法 |
|---|---|
| フロント → API（リクエスト受信） | Zod（Route Handler 冒頭） |
| Firestore → Infra（DB 読み取り後） | Zod。失敗は `FIRESTORE_DATA_CORRUPTION` |
| API → フロント（レスポンス受信後） | 型アサーション（自前 API のため） |

---

## やらないこと

| パターン | 理由 |
|---|---|
| グローバル Error Boundary（React） | ページ数が少なく、各ページで個別対応の方が適切 |
| カスタム例外の深い継承階層 | `InfraError` 1クラス + `code` で十分 |
| 全 API レスポンスの Zod 検証 | 自前 API なので型アサーションで十分。外部 API 連携時に導入 |
| Sentry 等の外部エラー監視 | Cloud Logging + Slack 通知で現時点は十分 |
