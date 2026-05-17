# Error Handling Guide

## 基本方針

- Domain 層は例外を投げず、ビジネス上の失敗は `Result` 型や戻り値で表現する。
- Infra 層は Firebase、gRPC、ZodError など外部境界の失敗を `InfraError` に変換して throw する。
- Application 層は原則 catch せず、InfraError を上位へ伝搬する。
- Route Handler は `InfraError` を HTTP status に変換し、ログ出力と Slack 通知を行う。
- Hooks 層は HTTP status と fetch 失敗をユーザー向け日本語メッセージに変換する。
- UI 層は Hooks から受け取った日本語メッセージを表示する。

## InfraErrorCode

| コード | 主な発生源 | HTTP | Slack通知 |
|---|---|---|---|
| `FIRESTORE_UNAVAILABLE` | gRPC code=14、Firestore 利用不能、不明な Firestore エラー | 503 | する |
| `FIRESTORE_PERMISSION` | gRPC code=7、Firestore 権限不備 | 500 | する |
| `FIRESTORE_DATA_CORRUPTION` | DB 読み取り後の Zod 検証失敗 | 500 | する |
| `AUTH_UNAVAILABLE` | Firebase Auth のネットワーク障害・内部障害 | 503 | する |
| `AUTH_FAILED` | パスワード違い・無効 token など認証失敗 | 401 | しない |

`InfraErrorCode` を追加したら `src/lib/infraErrorToHttpStatus.ts` の switch を必ず更新する。網羅性チェックにより漏れをコンパイルエラーにする。

## 認証エラー

認証失敗とインフラ障害を分離する。

- idToken/session cookie の期限切れ、revoke、無効 token は `401`。
- Firebase Auth 自体の障害、ネットワーク障害、想定外 SDK エラーは `AUTH_UNAVAILABLE` / `503`。
- ログイン画面など公開ページでは 500/503 の詳細を出し分けず、監視インフラの存在を公開しない。

## バリデーション

| 境界 | 手法 |
|---|---|
| フロント → API | Route Handler 入口で Zod 検証 |
| Firestore → Infra | Zod 検証。破損データは `FIRESTORE_DATA_CORRUPTION` |
| API → フロント | 自前 API のため型アサーション中心。外部 API 連携時は Zod 検証を追加 |

## Slack 通知

Slack 通知は「人が対応しないと直らない障害」を主対象にする。現行の共通 `handleRouteError` は `InfraError` と想定外エラーを一律で `notifySlackFireAndForget` に渡すため、通知対象を増減する場合は共通 helper の条件分岐も同時に見直す。通知処理は API レスポンスを Slack の成否でブロックしない。

## ログレベル

| レベル | 用途 |
|---|---|
| ERROR | 処理が完了できなかった障害、Firestore 障害、想定外エラー |
| WARN | 処理は完了したが異常がある認証失敗や不審入力 |
| INFO | ログイン成功など正常な重要イベント |

## 現時点で導入しないもの

- React Error Boundary の全面導入。
- 深いカスタム例外階層。
- 全 API response の Zod 検証。
- Sentry など外部監視 SaaS。現状は Cloud Logging + Slack 通知で足りる。
