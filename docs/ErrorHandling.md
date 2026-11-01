# Error Handling Guide

## 基本方針

- Domain 層は例外を投げず、ビジネス上の失敗は `Result` 型や戻り値で表現する。
- Infra 層は Firebase、gRPC、ZodError など外部境界の失敗を `InfraError` に変換して throw する。
- Application 層は原則 catch せず、InfraError を上位へ伝搬する。
- Route Handler は `InfraError` を HTTP status に変換し、ログ出力と Slack 通知を行う。
- Hooks 層は HTTP status と fetch 失敗をユーザー向け日本語メッセージに変換する。status ごとの文言は `src/hooks/httpErrorMessage.ts` に集める。Slack に通知されるのは 5xx だけなので、400 / 404 では「管理者に通知済み」と言わない。
- ログインが必要な API は `src/hooks/auth/fetchWithSession.ts` 経由で呼ぶ。401（Session Cookie の期限切れ・無効、Emulator の再起動など）はエラーメッセージにせず、`/login` へ移す。`/api/auth/login` の 401 は認証情報の誤りなので対象外（`useLogin` は `fetch` を直接使う）。
- UI 層は Hooks から受け取った日本語メッセージを表示する。

## InfraErrorCode

| コード | 主な発生源 | HTTP | Slack通知 |
|---|---|---|---|
| `FIRESTORE_UNAVAILABLE` | gRPC code=14、Firestore 利用不能、不明な Firestore エラー | 503 | する |
| `FIRESTORE_PERMISSION` | gRPC code=7、Firestore 権限不備 | 500 | する |
| `FIRESTORE_DATA_CORRUPTION` | DB 読み取り後の Zod 検証失敗 | 500 | する |
| `FIRESTORE_NOT_FOUND` | gRPC code=5、存在しないドキュメントへの `update()`（入力が原因） | 404 | しない（WARN ログ） |
| `AUTH_UNAVAILABLE` | Firebase Auth のネットワーク障害・内部障害 | 503 | する |
| `AUTH_FAILED` | パスワード違い・無効 token など認証失敗 | 401 | しない |

`InfraErrorCode` を追加したら `src/lib/infraErrorToHttpStatus.ts` の switch を必ず更新する。網羅性チェックにより漏れをコンパイルエラーにする。

Firestore の例外から `InfraError` への変換は `src/infra/firestoreError.ts` の1か所で行い、元の例外は `cause` に残す。`handleRouteError` はログに `cause` を出す（`InfraError` の message だけでは、例えば `RangeError` が `Firestore unknown error` になって原因が分からない）。

入力が原因の失敗を障害に分類しないよう、Route Handler の入口で検証する。`[id]` は `src/lib/api/documentIdSchema.ts`（Firestore のドキュメント ID の制約）、日付は `src/lib/api/dateSchema.ts`、`request.json()` は `.catch(() => null)` で受けて 400 にする。

## 認証エラー

認証失敗とインフラ障害を分離する。

- idToken/session cookie の期限切れ、revoke、無効 token は `401`。
- `verifyIdToken` の `auth/argument-error` は、不正なトークンと Google の公開鍵の取得失敗（障害）の両方で返る。メッセージが `Decoding Firebase ID token failed` / `Firebase ID token ` で始まるものだけを 401 にし、それ以外は 503 + 通知にする（`src/lib/auth/idTokenError.ts`。firebase-admin の更新で文言が変わったら unit test が落ちる）。
- Firebase Auth 自体の障害、ネットワーク障害、想定外 SDK エラーは `AUTH_UNAVAILABLE` / `503`。
- Session Cookie の確認（`src/lib/auth/verifySession.ts`）も同じ考え方で、期限切れ・失効・無効化/削除されたユーザー・中身が不正な Cookie だけを未ログイン（401）にし、それ以外（`app/network-error`、`auth/internal-error` など）は `AUTH_UNAVAILABLE` にする。
- Route Handler はセッションの確認を `requireSession(request, label)`（`src/lib/api/routeHelpers.ts`）で行う。Auth の障害も `handleRouteError` を通るので 503 + 通知になる。`getSession` を try の外で直接呼ぶと、障害が 500 になり、ログにも Slack にも残らない。
- ログイン画面など公開ページでは 500/503 の詳細を出し分けず、監視インフラの存在を公開しない。

## バリデーション

| 境界 | 手法 |
|---|---|
| フロント → API | Route Handler 入口で Zod 検証 |
| Firestore → Infra | Zod 検証。破損データは `FIRESTORE_DATA_CORRUPTION` |
| API → フロント | 自前 API のため型アサーション中心。外部 API 連携時は Zod 検証を追加 |

## Slack 通知

Slack 通知は「人が対応しないと直らない障害」を主対象にする。共通 `handleRouteError` は `FIRESTORE_NOT_FOUND` を除く `InfraError` と想定外エラーを `notifySlackFireAndForget` に渡すため、通知対象を増減する場合は共通 helper の条件分岐も同時に見直す。通知処理は API レスポンスを Slack の成否でブロックしない。

## 壊れた予約の読み飛ばし

予約の読み取りで `FIRESTORE_DATA_CORRUPTION` になったドキュメントは読み飛ばし、他の予約の取得は続ける。読み飛ばした予約は画面から消え、空室に見えるので、人が直す必要がある（`src/lib/skippedReservationReporter.ts`）。

- 取得ごとに件数・ID・理由を WARN で出す。Cloud Logging で検索・集計する。
- Slack には通知しない。データの異常は障害ではなく、画面を開くたびに通知すると本物の障害が埋もれるため（2026-10-31 決定）。

## ログレベル

| レベル | 用途 |
|---|---|
| ERROR | 処理が完了できなかった障害、Firestore 障害、想定外エラー |
| WARN | 処理は完了したが異常がある認証失敗や不審入力 |
| INFO | ログイン成功など正常な重要イベント |

`logger` の第1引数がログの本文（どの処理の何のログか）。第2引数の `message` は本文を上書きしないよう `detail` に移す。

## 現時点で導入しないもの

- React Error Boundary の全面導入。
- 深いカスタム例外階層。
- 全 API response の Zod 検証。
- Sentry など外部監視 SaaS。現状は Cloud Logging + Slack 通知で足りる。
