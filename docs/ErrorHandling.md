# Error Handling Policy

## 概要

- このドキュメントは エラー処理の方針 を層ごとに定義する。
- 4段階（検出→伝搬→回復→通知）をアーキテクチャに適用する。
- Try-Catch構文とResult型を使い分ける

---

## 前提: 本プロジェクトの特性

| 特性 | 影響 |
|---|---|
| Cloud Run (max 1 instance) | インメモリ状態(program上のメモリに置く変数やキャッシュなど)が使える。分散一貫性(複数のインスタンスでデータの整合性を取ること)を気にする必要なし |
| Firestore が唯一の外部DB | infra 層のエラー源はほぼ Firestore と Firebase Auth |
| 7部屋・小規模運用 | 大量トランザクションの競合は起きにくい。リトライは控えめでよい |
| UI | エラー時に「何をすべきか」を日本語で端的に伝える必要がある |

---

## 1. 層ごとのエラー処理方針

### 概要図

```
UI層（components/）
  表示専用（エラー表示・ボタン
  ↑
  │
Hooks層（hooks/）
  状態管理 + HTTP解釈 + メッセージ変換
  ↑ HTTPレスポンス
　│
Route Handler（app/api/）
  HTTP ステータスコードへの変換。開発者向け構造化ログ出力
  ↑ throw
  │
Application層（application/）
  オーケストレーション。
  ↑ throw
  │
Domain層（domain/）
  純粋TS。例外を投げない。Result 型で返す
  │
Infra層（infra/）
  外部通信の try-catch。リトライ。構造化エラーへの変換
```


---
### 補足

#### 1-1. Application層 — オーケストレーションとエラー判断

Application層は Domain と Infra を組み合わせる。ここでの責務は:

1. **Infra のエラーをそのまま上に投げるか、回復を試みるか判断する**
2. **部分成功の巻き戻しが必要なら実行する**
3. **Domain の Result 型を検査して、失敗なら適切なエラーに変換する**

**方針**: 読み取り系 UseCase ではエラーをそのまま伝搬。書き込み系 Command では部分成功の巻き戻しを実装する。(現在はreadなので巻き戻しが必要な箇所はない)

---

#### 1-2. Route Handler — HTTP ステータスへの変換 + ログ

Route Handler はエラーの「翻訳層」。内部エラーを HTTP ステータスコードに変換し、開発者向けログを出力する。

**マッピング表**:

| InfraErrorCode | HTTP Status | ユーザ向け意味 |
|---|---|---|
| `FIRESTORE_UNAVAILABLE` | 503 | 一時的な障害。リトライ可 |
| `FIRESTORE_PERMISSION` | 500 | サーバー設定の問題 |
| `FIRESTORE_DATA_CORRUPTION` | 500 | DB データ破損 |
| `AUTH_FAILED` | 401 | 認証失敗 |
| `AUTH_UNAVAILABLE` | 503 | 認証サービス一時障害 |
| Zod parse failure（リクエスト） | 400 | リクエスト不正 |
| Unknown | 500 | 想定外 |

---

#### 1-3. Hooks層 — ユーザ向けメッセージ + リトライUI

Hooks 層は Route Handler から返された HTTP レスポンスを解釈し、ユーザ向けの日本語メッセージに変換する。

**ユーザ向けメッセージの原則**:
- システム内部の情報（Firestore, エラーコード等）は一切見せない
- 「あなたが何をすべきか」を伝える（待つ / 管理者に連絡 / 入力を修正）
- 平易な日本語にする

---

## 2. バリデーション戦略（検出の第1段階）

既存方針を明文化:

| 境界 | 方向 | 手法 | 例 |
|---|---|---|---|
| フロント → API | リクエスト送信前 | Zod（Route Handler 冒頭） |
| Firestore → Infra | DB読み取り後 | Zod（infra 内） |
| API → フロント | レスポンス受信後 | 型アサーション（`as Promise<T>`） |

---

## 3. ログ戦略(通知)

### 3-1. ログレベルの定義

| レベル | 用途 | 例 |
|---|---|---|
| `ERROR` | 処理が完了できなかった | Firestore 接続失敗、Zod パース失敗 |
| `WARN` | 処理は完了したが異常がある | 部屋未割り当て予約の検出|
| `INFO` | 正常な重要イベント | ログイン成功、デプロイ完了 |

Cloud Run のログは Cloud Logging に自動収集される。JSON で出力すれば構造化クエリが可能になる。

### 3-2. Slack 通知

既存の `#ryokan-alerts` チャネルを活用:

| イベント | 通知先 | 優先度 |
|---|---|---|
| ログイン失敗5回（アカウントロック） | `#ryokan-alerts` | 高 |
| Firestore 接続失敗（リトライ後も失敗） | `#ryokan-alerts` | 高 |
| DB データ破損（Zod パース失敗） | `#ryokan-alerts` | 高 |

---

## 4. やらないこと

| パターン | 理由 |
|---|---|
| グローバル Error Boundary（React） | 現時点ではページ数が少なく、各ページで個別にエラー処理する方が適切 |
| カスタム例外の深い継承階層 | `InfraError` 1クラス + `code` フィールドで十分。階層が深いと複雑になるだけ |
| 全 API レスポンスの Zod 検証 | 自分の API なので型アサーションで十分。外部 API 連携時に導入 |
| Sentry 等の外部エラー監視 | Cloud Logging + Slack 通知で現時点は十分。規模拡大時に検討 |

## 5. 注意事項
- gRPC コード（14, 7）のマジックナンバーにコメントを必ず付ける