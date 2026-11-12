# Ryokan System V3 front

小規模旅館（客室7部屋）のスタッフが日々の業務に使う Web アプリ。予約の確認・編集、タイムテーブルと清掃ボードの印刷、宿泊税（A税）の受領管理を行う。

このファイルは毎セッション読み込まれる。詳細は必要になったときに読む:

| ファイル | 読むとき |
|---|---|
| [docs/Domain.md](docs/Domain.md) | 業務用語、画面と API、Firestore のデータ構造、予約の正規化と検証、画面ごとの計算ロジックに触れるとき |
| [docs/Development.md](docs/Development.md) | ローカル起動、テストの追加、CI/CD・デプロイ・依存の更新に触れるとき |
| [docs/Security.md](docs/Security.md) | 認証・ヘッダー・権限・依存・秘密情報に触れるとき。対策を実装・変更したら §7・§8・§10 も更新する |
| [docs/SecurityImplementation.md](docs/SecurityImplementation.md) | Security.md §8・§10 の対策を実装するとき（作業一覧） |

## 前提（コードからは読み取れないこと）

- 利用者は旅館スタッフ約10名、PC 4〜5台。Firebase Auth のアカウントは **人ではなく PC 単位**。新規登録は無効、ロールなし（ログインできれば全機能を使える）。人単位の認可・監査は作らない。ログインは パスワード → フロントの電話への SMS のコード の2段（PC のアカウントごとに電話を登録。登録は `scripts/mfa/enrollPhone.ts` を人が実行する。[docs/Development.md](docs/Development.md)「SMS の2要素目」）
- 利用時間は 6:00〜23:00 JST。本番はこの時間外に画面もログインも使えない
- **Firestore は別リポジトリ `gmail-listener`（予約メールの取り込み）と共有している。** `guestInfoV2` の大半はそちらが書く。フィールド名・形式を変えると向こうが壊れる（[docs/Domain.md](docs/Domain.md)「予約の作成元」）
- 本番 DB には過去のシステムが書いた **形の崩れたデータ** が残っている。読み取りは「壊れていても落ちない」ことを前提に書かれている
- 開発者は1人。Git の commit・push はユーザーが行う。ブランチは `development` から切る（`feature/*` → `development` → `main`）

## コマンド

```bash
make                 # Emulator 起動 → データ投入 → 開発サーバー（http://127.0.0.1:3000、dev@example.com / dev-password、SMS のコードは make mfa-code）
npm run lint
npx tsc --noEmit
npm run test -- --run  # unit / integration / PBT / fuzz（Vitest。Emulator 不要）
npm run test:tz        # tests/time/ を3つの TZ で実行
npm run test:emulator  # Firestore/Auth Emulator への往復検査（Java と firebase-tools が必要）
npm run e2e            # Playwright（API はブラウザ側でモック。Emulator 不要）
npm run e2e:prod       # 本番ビルドに対する E2E（セキュリティヘッダーが攻撃を止めるか。127.0.0.1:3100）
npm run e2e:emulator   # 本物のログイン（Auth Emulator）を通す E2E（セッション Cookie の属性・失効。127.0.0.1:3200）
make check             # 上の全部（make で起動中の Emulator / 開発サーバーは止めてから）
```

変更後は最低限 `npm run lint`、`npx tsc --noEmit`、`npm run test -- --run` を通す。画面・認証・ルーティング・印刷に触れたら `npm run e2e`（ヘッダー・CSP・`proxy.ts`・`next.config.ts` なら `npm run e2e:prod`、ログイン・Cookie なら `npm run e2e:emulator` も）、Dockerfile・`next.config.ts`・環境変数に触れたら `npm run build` も。

## 技術スタック（インストール済みの版）

Next.js 16.4（App Router）/ React 19.3 / MUI 9.5 + X Date Pickers 9.16 / Emotion 11 / Firebase 13（テストだけ: `tests/emulator/firestoreRules.test.ts`）/ firebase-admin 14.5（サーバー: Firestore・Auth）/ Zod 4 / dayjs / TypeScript 6（strict）/ Vitest 5 + fast-check / Playwright 1.64 / Node 26（Docker・CI）

**どれも学習データより新しい。** 古い知識で書かない:
- Next.js は同梱ドキュメント `node_modules/next/dist/docs/` を先に読む。例: `middleware.ts` は **`proxy.ts`（関数名 `proxy`）に改名済み**。Route Handler の `params` は `Promise`
- その他のライブラリは Context7 MCP で公式ドキュメントを確認する（Zod 4 の `z.flattenError`、`.default()` と `.catch()` の挙動、MUI 9 の `slotProps`（system props と `inputProps`・`PaperProps` などは削除済み）など）。query は具体的に（例: `Firestore transaction firebase-admin node`）、1つの疑問に3回まで。ID（`resolve-library-id` を省ける）: `/vercel/next.js` `/facebook/react` `/mui/material-ui` `/mui/mui-x` `/firebase/firebase-js-sdk` `/firebase/firebase-admin-node` `/colinhacks/zod` `/iamkun/dayjs` `/vitest-dev/vitest` `/microsoft/playwright`

## アーキテクチャ

```
ブラウザ: app/(page) → components/ → hooks/ ──fetch──┐
サーバー: proxy.ts（全ページ: CSP・ヘッダー・時間帯・Cookie 有無）  │
          app/api/**/route.ts ←───────────────────────┘
            → application/（UseCase=読み取り / Command=変更）
                → domain/（純粋な計算・検証）
                → infra/（Firestore。domain/ports の実装）
```

| ディレクトリ | 役割 | 依存してよいもの |
|---|---|---|
| `src/app/` | ページと Route Handler。`page.tsx` は default export（Next.js の規約） | すべて |
| `src/app/api/` | セッション検証 → Zod 検証 → Application 呼び出し → HTTP 変換 | application, infra, lib, domain, types |
| `src/application/` | 手順の組み立て、Slack 通知。原則 catch しない | domain, infra, lib, types, constants |
| `src/domain/` | 純粋 TS。部屋の状態、予約の更新検証、泊別配列。失敗は `Result` で返す | types, constants, `lib/dateUtils` だけ |
| `src/infra/` | Firestore 読み書き、Zod による読み取り検証と正規化、例外の `InfraError` 化 | domain/ports, lib, types, constants |
| `src/hooks/` | API 呼び出し、loading / error、HTTP status → 日本語メッセージ | lib, types, constants（application は **型だけ**） |
| `src/components/` | 表示とイベント通知。named export | hooks, domain（純粋関数）, lib, types, constants |
| `src/lib/` | 横断処理: `api/`（Zod スキーマ・Route 共通処理）, `auth/`, `firebase/`, csp, logger, slack, dateUtils | — |
| `src/constants/` | 定数（部屋、時刻の許容値、上限値、営業時間）。純粋 TS | — |
| `src/types/` | 共有型。`Reservation`, `ReservationPatch`, `InfraError`, `Result` | — |

既存の例外（真似してよい）: 単純な読み書き（`daily/*`、`reservations/[id]/a-tax`）は Route から infra を直接呼ぶ。ログイン API（`auth/login`・`auth/login/verify`）は `requireSession` を使わず（ログイン前）、`adminAuth` を直接使う（`lib/auth/loginSession.ts`）。

## 実装ルール

- `any` 禁止。`unknown` + 型ガード。Import は `@/*`（= `src/*`）、テストからは `@tests/*`
- コンポーネントは named export（`page.tsx` / `layout.tsx` などの Next.js 規約ファイルを除く）
- 定数は `src/constants/` に置く。**同じ値を UI の選択肢・Route の Zod・Infra の読み取り検証の3か所で共有する**（例: `ARRIVAL_TIME_VALUES`, `RESERVATION_LIMITS`, `MAX_NIGHTS`）。片方だけ変えると「保存できたのに読み戻すと消える」が起きる。`tests/unit/constraints/` が突き合わせを検査している
- hooks: React 19 のルールで **useEffect の中で同期的に setState しない**。既存の hooks は「取得済みのキー（`fetchedDate` など）と今のキーが違えば loading」で表す。新しい取得 hook もこの形に揃える。ログイン必須の API は `fetch` ではなく `fetchWithSession`（401 でログイン画面へ）
- Route Handler の型: `requireSession(request, label)` → `safeParse` → 失敗は `invalidInputResponse`（本番は検証の詳細を返さない）→ `try { … } catch (e) { return handleRouteError(e, label) }`。すべて `src/lib/api/routeHelpers.ts`
- ログに入力値・個人情報（ゲスト名、メモ）を出さない。出してよいのはパス・コード・ID・件数

### エラー処理（層ごと）

- Domain: 例外を投げず `Result<T, E>`（`src/types/result.ts`）
- Infra: Firestore/gRPC/Zod の例外を `InfraError` に変換して throw（`withFirestoreError`, `toInfraError`）
- Application: catch しない。業務上の失敗（存在しない、すでにキャンセル済み）は `Result` で返す
- Route: `handleRouteError` が status に変換し、ログと Slack 通知（`FIRESTORE_NOT_FOUND` は通知しない）
- Hooks: `httpErrorMessage`（`src/hooks/httpErrorMessage.ts`）で日本語化。「管理者に通知済み」は 5xx のときだけ言う

| InfraErrorCode | HTTP | Slack |
|---|---|---|
| `FIRESTORE_UNAVAILABLE`, `AUTH_UNAVAILABLE` | 503 | する |
| `FIRESTORE_PERMISSION`, `FIRESTORE_DATA_CORRUPTION` | 500 | する |
| `FIRESTORE_NOT_FOUND` | 404 | しない |
| `AUTH_FAILED` | 401 | — |

コードを追加したら `src/lib/infraErrorToHttpStatus.ts`（網羅性チェックでコンパイルエラーになる）とこの表を更新する。

- 入力が原因の失敗を 5xx・Slack 通知にしない。不正な ID・日付・JSON は Route の入口で 400、存在しないものは 404
- 外部 SDK のエラーを「`auth/` で始まれば未ログイン」「その他はすべて障害」のように大雑把に分類しない。同じコードが入力の誤りにも障害にも使われる（例: `auth/argument-error`。`src/lib/auth/` はメッセージの先頭で見分けている）
- ログイン画面では 500 と 503 を出し分けない（監視の存在を見せない）
- 今は入れないと決めたもの: React Error Boundary の全面導入、深い例外クラスの階層、全 API レスポンスの Zod 検証、Sentry などの外部監視（Cloud Logging + Slack で足りる）

## 壊してはいけないもの

1. **日付の形式**: Firestore 上の `guestInfoV2` は `YYYY/MM/DD`、アプリ・API・`dailyInfo` のドキュメント ID は `YYYY-MM-DD`。変換は infra だけで行う
2. **「今日」は JST**: Cloud Run は UTC。`new Date()` のローカル日付を使わず `getTodayJST()` を使う。日付計算は `src/lib/dateUtils.ts`（`dateDiff`, `addDays`）。`tests/time/` が TZ を変えて検査する
3. **泊別配列の長さ = 泊数**（`dinner_time`, `dinner_info`, `breakfast_time`, `open_air_bath_time`, `timetable_info`）、`age_groups` の長さ = 大人の人数。C/O 日や人数を変える更新は配列も一緒に送る。検査は `validateReservationPatch` を **トランザクションの中で** DB の今の値に対して行う
4. **起動ガード**: development / test は Emulator と `demo-*` project にだけ接続し、本番の鍵があれば起動しない。production は Emulator 系の変数があれば起動しない（`src/instrumentation.ts`, `src/lib/firebase/runtimeEnvGuard.ts`）。外さない・緩めない。開発サーバーと Emulator は `127.0.0.1` に bind
5. **セキュリティの境界は各 Route Handler の `requireSession`**。`proxy.ts` の Cookie 有無の確認は画面遷移のためで、境界ではない。新しい API には必ず `requireSession` を入れる
6. **ブラウザから Firebase を呼ばない**（`firestore.rules` は全拒否。CSP の `connect-src` は `'self'` だけ）。ログインもブラウザはメールアドレスとパスワードを `/api/auth/login` に、SMS のコードを `/api/auth/login/verify` に送るだけで、サーバーが REST で確かめる（失敗回数を数えるため）。Session Cookie は2要素目を通ったトークンにだけ出す（`lib/auth/secondFactor.ts`）。`src/` からの `firebase` パッケージの import は ESLint で禁止
7. **CSP は nonce ベース**（`src/lib/csp.ts`、`proxy.ts`）。外部の API・画像・フォント・iframe・analytics を足すときは CSP と COEP/CORP を変える必要がある。`tests/unit/lib/csp.test.ts` が本番の CSP を固定している
8. **本番データ・本物の認証情報をコード・テスト・ログ・会話に入れない**。`npm run anonymize` / `make anonymize`（本番を読む）は **AI エージェントは実行しない**

## 一緒に更新するもの

| 変更 | 一緒に更新 |
|---|---|
| 予約フィールドの追加・許容値の変更 | `types/reservation.ts`, `types/guestInfo.ts`（`ReservationPatch`）, `lib/api/reservationSchemas.ts`, infra の `FirestoreReservationSchema`/`toReservation`, `constants/guestInfo.ts`, `scripts/localdev/lib/allowlist.ts`（匿名化。未登録のフィールドはマスクされる）, [docs/Domain.md](docs/Domain.md) |
| API の追加 | `requireSession`、Zod、`tests/integration/api/` のテスト、`tests/integration/fuzz/routes.fuzz.test.ts` |
| 外部通信の追加 | `src/lib/csp.ts`, `proxy.ts` のヘッダー, `tests/unit/lib/csp.test.ts` |
| CI/CD | `.github/workflows/*.yml` と [docs/Development.md](docs/Development.md) |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
