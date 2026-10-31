# Local Development 実装手順（Firebase Emulator）

`docs/LocalDevelopment.md`（以下「仕様」）を実装するための手順書。要件 ID（DEV-1 など）と受け入れ基準 ID（AC-1 など）は仕様のものを使う。

---

## 0. 現状（2026-10-31 調査）

仕様とのずれ。実装はここを起点にする。

| # | 現状 | 該当箇所 | 関係する要件 |
|---|---|---|---|
| G-1 | `.env.development` に本番の `FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` が置かれ、開発サーバーが本番 Firestore / Auth に直接つながっている | `.env.development` | DEV-1, DEV-6, OPS-2 |
| G-2 | `admin.ts` は鍵があれば `cert()`、なければ引数なし `initializeApp()`（ADC へ fallback）。Emulator 用の経路がない | `src/lib/firebase/admin.ts` | DEV-3, AC-5 |
| G-3 | 起動時の環境変数チェックがない。`instrumentation.ts` がない | - | DEV-2, PROD-1, PROD-2 |
| G-4 | ブラウザ側の Auth は `getAuth(firebaseApp)` を各所で直接呼んでいる（`useLogin.ts` と、現在どこからも使われていない `firebaseAuthProvider.ts`）。Emulator 接続処理がない | `src/hooks/auth/useLogin.ts`, `src/infra/auth/firebaseAuthProvider.ts`, `src/lib/firebase/client.ts` | DEV-4 |
| G-5 | CSP の `connect-src` は本番の Firebase Auth エンドポイントのみ | `src/proxy.ts` | DEV-5 |
| G-6 | E2E は CI でダミーの `NEXT_PUBLIC_FIREBASE_*`（project ID は `dummy-project`）だけを渡して `npm run dev` を起動している。ローカルでは `.env.development`（本番鍵入り）で起動する | `.github/workflows/ci.yml`, `playwright.config.ts` | DEV-7 |
| G-7 | `firebase.json` / `.firebaserc` / Emulator 起動スクリプト / 投入スクリプト / 匿名化スクリプトがない | - | SEED-*, ANON-* |
| G-8 | 開発 PC に gcloud のユーザー認証と ADC（`~/.config/gcloud/application_default_credentials.json`）が残っている | 開発 PC | OPS-4, AC-5, AC-27 |
| G-9 | ツール: Node 22（CI は Node 20）、`gcloud`、`firebase` CLI、Java は導入済み。TS スクリプトの実行手段（`tsx` など）はない | - | - |

参考: E2E のモックは `**/identitytoolkit.googleapis.com/**` と `**/securetoken.googleapis.com/**` の glob で書かれている。Auth Emulator 接続後の URL は `http://127.0.0.1:9099/identitytoolkit.googleapis.com/...` になるため glob にはそのまま一致する見込み（Phase 4 で確認する）。

---

## 1. 設計上の決定

実装中にぶれないよう、先に固定する。変える場合はこの節を先に直す。

### 1.1 環境変数

| 変数 | 側 | development | production | 備考 |
|---|---|---|---|---|
| `FIREBASE_PROJECT_ID` | サーバー | `demo-ryokan`（必須） | 任意。`demo-` 始まりは拒否 | 既存の変数を流用 |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ブラウザ | `demo-ryokan`（サーバー側と一致必須） | 本番値 | build 時にバンドルへ埋め込まれる |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ブラウザ | 任意のダミー値（例: `demo-api-key`） | 本番値 | SDK の存在チェックを通すためだけに必要 |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ブラウザ | 任意のダミー値 | 本番値 | |
| `FIRESTORE_EMULATOR_HOST` | サーバー | `127.0.0.1:8080`（必須） | 設定禁止 | Admin SDK 標準 |
| `FIREBASE_AUTH_EMULATOR_HOST` | サーバー | `127.0.0.1:9099`（必須） | 設定禁止 | Admin SDK 標準 |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | ブラウザ | `127.0.0.1:9099`（必須） | 設定禁止 | `connectAuthEmulator` と CSP で使う |

- 「Emulator 系の環境変数」= `*_EMULATOR_HOST` で終わるすべての変数 + `FIREBASE_EMULATOR_HUB` + `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`。
- 「本番の認証情報」= `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `GOOGLE_APPLICATION_CREDENTIALS`, および名前に `PRIVATE_KEY` を含む変数（過去の `NEXT_PUBLIC_FIREBASE_PRIVATE_KEY` の誤記を拾うため）。
- 変数名の一覧は `src/constants/` に置く（AGENTS.md「定数は constants/ に書け」）。
- **`NEXT_PUBLIC_*` は build 時にインライン化される。** サーバー側のガードで `Object.keys(process.env)` を走査しても production では見えないため、`NEXT_PUBLIC_*` は変数名を直接書いて参照する（`process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`）。こうすれば build 時の値がガードにも埋め込まれ、PROD-1 で検出できる。

### 1.2 ファイル配置

```
firebase.json                      # Emulator 設定（firestore:8080, auth:9099, ui:4000, singleProjectMode）
.firebaserc                        # default project = demo-ryokan（Firebase CLI の誤操作で本番に向かないように）
.env.development.example           # Emulator 用の値だけを記載（鍵の欄は作らない）
src/instrumentation.ts             # register() で起動ガードを実行（throw で起動を止める）
src/constants/runtimeEnv.ts        # 環境変数名、demo- 接頭辞
src/lib/firebase/runtimeEnvGuard.ts# 純粋関数: env と NODE_ENV → Result（どの規則に違反したか）
src/lib/firebase/admin.ts          # Emulator 経路 / 本番経路の2択に整理
src/lib/firebase/client.ts         # firebaseAuth を export し、Emulator 接続を集約
scripts/localdev/
  seed.ts                          # SEED-*
  anonymize.sh                     # 認証の取得と後片付け（ANON-1〜5）、anonymize.ts を呼ぶ
  anonymize.ts                     # 本番の読み取り → 変換 → 出力（ANON-6〜11）
  lib/                             # 純粋関数（unit test 対象）
    allowlist.ts                   # パスごとの扱い（残す / 振り直す / シャッフル / マスク）
    path.ts                        # `guestInfoV2.mail_memo[].source` 形式のパス生成
    mask.ts, joyoKanji.ts          # マスクと常用漢字表
    idRemap.ts, shuffle.ts
    serialize.ts                   # Firestore 型を保つ JSON 形式（後述）
    shapeReport.ts, dateValidity.ts, reportDiff.ts
    guards.ts                      # ANON-5, SEED-1 の判定
.localdev/                         # 匿名化データとレポートの唯一の出力先（Git・Docker 対象外）
  data/{guestInfoV2,dailyInfo}.json, meta.json
  reports/shape-latest.json, shape-YYYYMMDD-HHmmss.json
tests/unit/localdev/               # scripts/localdev/lib の unit test
tests/unit/lib/runtimeEnvGuard.test.ts
tests/fixtures/localdev/           # 手書きの人工データ（投入の動作確認・匿名化のテスト用）
```

- 起動ガードの判定は純粋関数にし、`instrumentation.ts` と `admin.ts` の両方から使う。`instrumentation.ts` の `register()` で throw すると開発・本番どちらのサーバーも起動しない（Next.js 16 の `prepareImpl` が register の完了を待つため。Context7 で確認済み）。`admin.ts` 側でも同じ判定から初期化経路を決め、ガードをすり抜けた場合も本番経路に落ちないようにする（fail closed）。
- `NODE_ENV=test`（Vitest）ではガードを適用しない。`admin.ts` を import するテストを壊さないため。
- TS スクリプトの実行には `tsx` を devDependency に追加する（Node 20 の CI でも unit test は Vitest で走るので影響なし）。

### 1.3 匿名化データの保存形式

JSON は `NaN` / `Infinity` / Timestamp を表せないため、タグ付き JSON にする。

```json
{ "$t": "timestamp", "s": 1767225600, "n": 0 }
{ "$t": "number", "v": "NaN" }        // NaN, Infinity, -Infinity, -0
{ "$t": "geopoint", "lat": 0, "lng": 0 }
{ "$t": "ref", "path": "guestInfoV2/xxx" }
{ "$t": "bytes", "b64": "..." }
{ "$t": "map", "v": { ... } }          // 元データのマップ自身が "$t" キーを持つ場合のエスケープ
```

- `serialize` / `deserialize` は往復で値と型が完全に一致することを unit test で固定する（AC-19 の土台）。
- ファイル構造: `{ "docs": [{ "id": "...", "data": { ... } }] }`。`meta.json` に `anonymizedAt`（ANON-9）、件数、スクリプトのバージョン。

### 1.4 認証の取得（匿名化時）

- `gcloud auth login` → `gcloud auth application-default login --impersonate-service-account=<閲覧専用SA>`。ADC は `impersonated_service_account` 型になり、SA の鍵ファイルは作られない（ANON-1）。
- 読み取りは `firebase-admin` を `applicationDefault()` + 本番 project ID で初期化して行う。コードからは `get()` / `listDocuments()` 以外を呼ばない。SA が `roles/datastore.viewer` しか持たないので、書き込みは権限でも防がれる（ANON-6）。
- 本番 project ID と SA のメールアドレスは秘密ではないが、リポジトリに書かず実行時の引数で渡す。

---

## 2. 実装フェーズ

AGENTS.md の「テスト → 実装」の順に合わせ、各フェーズはテストを先に書く。各フェーズの終わりに `npm run lint`、`npx tsc --noEmit`、`npm run test` を通す。

### Phase 0: 準備（人手、GCP）

1. Context7 で次を確認する（クエリは1質問3回まで）。
   - Firebase Admin v13: `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` 設定時に `initializeApp({ projectId })` だけで動くか、ADC を読みに行かないか。`createSessionCookie` / `verifySessionCookie(…, true)` が Auth Emulator で動くか。
   - Firebase JS v12: `connectAuthEmulator` を HMR で2回呼んだときの挙動（`auth.emulatorConfig` で判定できるか）。
   - Firebase CLI: `firebase.json` の `emulators.singleProjectMode`、`emulators:start --project demo-*`。
2. GCP で閲覧専用 SA を作成し、`roles/datastore.viewer` のみ付与する。開発者本人に、その SA に対する `roles/iam.serviceAccountTokenCreator` を付与する。手順は `GCP_SETUP.md` に追記する（Phase 9）。
3. `.env.development` に入っている鍵の発行元 SA と鍵 ID を控える（無効化は Phase 8。それまでは鍵が PC にある状態なので、Phase 1〜4 を先に終わらせる）。

### Phase 1: 起動ガード（純粋関数）

対応: DEV-2, PROD-1, PROD-2 / AC-1〜4, AC-10, AC-11

1. `tests/unit/lib/runtimeEnvGuard.test.ts` を先に書く。表駆動で次を固定する。
   - development: 必須3条件（Firestore Emulator、Auth Emulator、サーバー側 project ID が `demo-`）の各欠落、ブラウザ側 project ID の不一致・欠落、本番の認証情報4種（`NEXT_PUBLIC_FIREBASE_PRIVATE_KEY` を含む）の各設定 → それぞれ違反になる。全条件を満たす → OK。
   - production: Emulator 系の変数を1つずつ設定 → 違反。`FIREBASE_PROJECT_ID` / `NEXT_PUBLIC_FIREBASE_PROJECT_ID` が `demo-` 始まり → 違反。何も設定しない（CI の ZAP job と同じ）→ OK。
   - test: 何を設定しても OK。
   - 境界: `demo-` だけ、`DEMO-ryokan`、`xdemo-`、空文字の変数（空文字は「未設定」と扱うか「設定」と扱うかを決めてテストに書く。推奨: Emulator 系は空文字でも「設定」とみなし拒否、必須側は空文字を「未設定」とみなし拒否）。
2. `src/constants/runtimeEnv.ts` と `src/lib/firebase/runtimeEnvGuard.ts` を実装する。戻り値は `src/types/result.ts` の Result 型で、違反した規則をすべて列挙する（1回の起動で全部直せるように）。メッセージに変数の **値** は含めない。

### Phase 2: サーバー側の初期化と起動拒否

対応: DEV-1, DEV-2, DEV-3, PROD-1, PROD-2 / AC-1〜5, AC-10, AC-11

1. `src/instrumentation.ts` を追加する。`process.env.NEXT_RUNTIME === 'nodejs'` のときだけガードを実行し、違反があれば規則の一覧を含めて throw する。
2. `src/lib/firebase/admin.ts` を2経路に整理する。
   - Emulator 経路（development かつガード OK）: `initializeApp({ projectId: FIREBASE_PROJECT_ID })`。`credential` は渡さない。
   - 本番経路（production）: 引数なし `initializeApp()`（Cloud Run の ADC）。
   - `cert()` による鍵での初期化は削除する（DEV-3, OPS-2）。development でガードが NG なら初期化せず throw する。
3. 確認（手動。証拠として起動ログを残す。`docs/BugHunting.md` §1）:
   - AC-1〜4: 該当の変数を外す・変える・足すたびに `npm run dev` が起動しないこと。
   - AC-10, AC-11: `npm run build` → `FIRESTORE_EMULATOR_HOST=… npm run start`、`FIREBASE_PROJECT_ID=demo-x npm run start` がそれぞれ起動しないこと。何も足さない `npm run start` は起動すること（ZAP job を壊さない）。
   - AC-5 は Phase 4 で Emulator を起動してから確認する。

### Phase 3: ブラウザ側 Auth の集約と CSP

対応: DEV-4, DEV-5 / AC-8

1. `src/lib/firebase/client.ts` に `firebaseAuth` を追加して export する。`process.env.NODE_ENV === 'development'` かつ `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` があるときだけ `connectAuthEmulator(auth, 'http://<host>')` を呼ぶ。HMR での二重接続は `auth.emulatorConfig` で防ぐ。production build では `NODE_ENV` がインライン化され、接続処理ごと消える。
2. `useLogin.ts` を `getAuth(firebaseApp)` から `firebaseAuth` に置き換える。`firebaseAuthProvider.ts` も同様に置き換える（未使用なら削除してもよい。削除する場合は `domain/ports/authProvider.ts` と `loginPolicy` の扱いも合わせて判断する）。置き換え後、`grep -rn "getAuth(" src` が `client.ts` と Admin 側だけになることを確認する。
3. `src/proxy.ts` の `connect-src` に、`isDev` のときだけ `http://${NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST}` を加える。production の CSP 文字列は1文字も変えない。
4. CSP の組み立てを純粋関数に切り出し、unit test で「production では Emulator のアドレスが含まれない」「development では含まれる」を固定する（AC-8）。加えて `npm run build && npm run start` のレスポンスヘッダーを目視確認する。

### Phase 4: Emulator 設定、env テンプレート、E2E / CI

対応: DEV-1, DEV-6, DEV-7 / AC-5, AC-9

1. `firebase.json`（firestore / auth / ui のポート、`singleProjectMode: true`）と `.firebaserc`（`demo-ryokan`）を追加する。
2. `package.json` に scripts を追加する。
   - `emulators`: `firebase emulators:start --project demo-ryokan --only firestore,auth`
   - `seed`: `tsx --env-file=.env.development scripts/localdev/seed.ts`（Phase 5）
   - `anonymize`: `bash scripts/localdev/anonymize.sh`（Phase 7）
3. `.env.development.example` を §1.1 の development 列の値で書き直す（鍵の欄は作らない）。自分の `.env.development` も同じ内容に置き換え、**本番鍵を消す**（DEV-6）。
4. E2E の起動条件を `playwright.config.ts` の `webServer.env` に集約する（§1.1 の development 値 + ダミー API key）。CI の `e2e` job の `env:` ブロックはこれに置き換えて削除し、ローカルと CI を同じ設定にする。`.github/workflows/ci.yml` と `docs/CICD.md` を同時に更新する（AGENTS.md）。
   - 注意: `reuseExistingServer` によりローカルでは起動済みの dev サーバーを再利用する。その dev サーバーも Emulator 設定なので問題ない。
   - 確認: CSP で遮断されたリクエストは Playwright の `page.route` に届かない。Phase 3 の CSP 変更で Emulator アドレスが許可されていること、`login.spec.ts` のモック glob が Emulator の URL に一致することを確認する。
5. 確認:
   - AC-9: Emulator を起動せずに `npm run e2e` が通る。PR を作り CI の `e2e` が通る。
   - AC-5: ADC がログイン済みの状態（G-8 のまま）で `npm run emulators` + `npm run dev` を起動し、ログイン・一覧表示・保存を行う。Emulator UI（`http://127.0.0.1:4000`）にだけ書き込みが現れ、本番には何も届かないこと。可能ならネットワークを `127.0.0.1` 以外遮断した状態でも動くことを確認する。

### Phase 5: Emulator への投入（SEED）

対応: SEED-1〜4 / AC-6, AC-7, AC-25, AC-26

匿名化（Phase 6〜7）より先に作り、手書きの人工データ（`tests/fixtures/localdev/`）で動作を確かめる。fixture には仕様 §1 の「形」（キー欠損、型違い、`''` と `null` の混在、破損日付、Timestamp、`NaN`）を意図的に入れる。実データは入れない。

1. 先に unit test を書く: `guards.ts` の SEED-1 判定（Emulator 系の変数がない / `demo-` でない → 拒否）、`serialize.ts` の往復一致。
2. `seed.ts` を実装する。
   1. SEED-1 判定。満たさなければメッセージを出して非0で終了する（何も書かない）。
   2. 全データ削除: Firestore Emulator の `DELETE /emulator/v1/projects/{id}/databases/(default)/documents`、Auth Emulator の `DELETE /emulator/v1/projects/{id}/accounts`（SEED-2）。エンドポイントは Context7 か Firebase 公式 docs で確認する。
   3. `.localdev/data/*.json` を `deserialize` し、ID と値を変えずに batch（500件ごと）で書く（SEED-3）。データがなければ「`npm run anonymize` を先に実行」と案内して終了する。`--fixture` 指定時は `tests/fixtures/localdev/` を使う。
   4. 開発用ユーザーを `adminAuth.createUser` で作る（SEED-4）。メールアドレスとパスワードは Emulator 専用の固定値として `scripts/localdev/` の定数に置き、README 相当の docs に書く。本番の認証情報とは無関係な値にする。
3. 確認:
   - AC-25: Emulator 系の変数を外して `npm run seed` → 拒否される。
   - AC-26: 2回続けて投入しても件数が同じ。
   - AC-6, AC-7: 開発用ユーザーでログインでき、予約一覧に fixture が表示される。保存・キャンセル・追加が Emulator UI に反映される。

### Phase 6: 匿名化の変換ロジック（純粋関数）

対応: 変換規則、ID の振り直し、マスク、ANON-10, ANON-11 / AC-17〜24

AC の多くはここで unit test として固定する。乱数は引数で注入し、テストでは固定の乱数列を渡す。

1. `path.ts` + `allowlist.ts`
   - テスト: 仕様 §4.3 の表のパスを列挙し、それぞれの扱いを固定する。許可リストにないフィールド（例: `guestInfoV2.new_field`, `guestInfoV2.mail_memo[].unknown`）がマスクになる（AC-17）。`guestInfoV2.source` は残し、`dailyInfo.source.path` はマスク、`dailyInfo.source.collection` は残す（AC-18）。
   - 実装: 許可リストは `残す` / `ID` / `シャッフル` の3集合だけを持ち、それ以外はすべてマスクを返す（デフォルト拒否）。
2. `mask.ts` + `joyoKanji.ts`
   - テスト（AC-20）: 文字数（コードポイント数）、全角半角、大文字小文字、文字の種類、空白・改行・記号・絵文字の位置と値が元と同じ。ひらがな / カタカナ（全角・半角）/ 漢字（常用漢字表に含まれる）/ 英数字（全角・半角）/ その他（アクセント付きラテン、ハングル）をそれぞれ1件以上。サロゲートペアと絵文字の ZWJ 連結が壊れない。
   - テスト（数値）: 桁数、整数/小数、符号が同じ。`0` は `0`。`NaN`, `Infinity`, `-Infinity` はそのまま。`''`, `null`, 真偽値はそのまま。配列・マップは再帰。
   - 文字の種類は Unicode のコードポイント範囲で判定する。範囲表はこのファイルに置き、テストで代表文字を固定する。
3. `idRemap.ts`
   - テスト（AC-21）: 同じ実行内で同じ元の値 → 同じ新しい値。異なる元の値 → 衝突しない。コレクションやフィールドが違っても同じ元の値なら同じ新しい値（ドキュメント ID、`reservation_number`、`mail_id`、`todos[].id` で1つの対応表を共有する）。元の値と一致しない。
4. `shuffle.ts`
   - テスト: `country` の値の多重集合（`null` と `''` を含む）がシャッフル前後で一致する。キー欠損のレコードは欠損のまま（§3 未決事項 Q-3）。
5. 日付・部屋は「残す」に入っていることを allowlist のテストで固定する（AC-19 の変換側）。破損日付の文字列もそのまま残ることをテストに入れる。
6. `dateValidity.ts` + `shapeReport.ts`
   - テスト（AC-23）: 仕様 §4.3「破損日付」の表の各フィールドについて、書式違い（`check_in_date` の `2026-01-05`）、実在しない日付（`2026-02-30`、`2026-13-99`）、`mail_memo` の `"2"` + `"30"`（不可）と `"2"` + `"29"`（可）を数える。レポートを JSON 文字列にしたとき、入力に使った値（名前・日付・ID）が1つも含まれない。
   - レポートの種類: `string`, `emptyString`, `number`, `NaN`, `Infinity`, `boolean`, `null`, `missing`, `array`, `map`, `timestamp`, `geopoint`, `ref`, `bytes`, `corruptedDate`。`missing` は「そのコレクションで1回でも現れたパス」に対し、現れなかった件数。
7. `reportDiff.ts`
   - テスト（AC-24）: 前回より型の種類が増えたフィールドを警告として返す。新しく現れたパスも警告する。件数の増減だけでは警告しない。前回のレポートがない場合は警告なし。

### Phase 7: 匿名化の実行（I/O と認証の後片付け）

対応: ANON-1〜9, ANON-11 / AC-12〜16, AC-22

1. `anonymize.sh`（認証のライフサイクル）
   - `set -euo pipefail`。`cleanup` 関数で ANON-3 の3つを行う: `gcloud auth revoke --all`、`gcloud auth application-default revoke --quiet` + `application_default_credentials.json` が残っていないことの確認（残っていれば削除して警告）、`firebase login:list` でログインがあれば `firebase logout`。各コマンドは「ログインしていない」エラーを無視する。
   - 開始時にまず `cleanup` を実行する（ANON-4）。
   - `trap cleanup EXIT INT TERM HUP` を設定してから `gcloud auth login` → `application-default login --impersonate-service-account` → `tsx scripts/localdev/anonymize.ts --project <本番ID>` を実行する。SIGKILL や電源断は trap できないため ANON-4 で補う。
   - Emulator 系の変数があれば、何もせず（ログインもせず）拒否する（ANON-5）。`anonymize.ts` 側でも `guards.ts` で同じ判定をする（二重化）。
2. `anonymize.ts`（読み取り → 変換 → 出力）
   - 全件を読み取り（ANON-6）、Phase 6 の関数で変換する。変換前のデータは変数に持つだけで、ファイル・ログ・例外メッセージに出さない（ANON-7）。エラー時はドキュメント ID とパスだけを出す。
   - 書き出しは `.localdev/data/` だけ。一時ファイルを作らず、`meta.json` に `anonymizedAt`（JST の日付）を書く（ANON-9）。
   - 形のレポートを `.localdev/reports/` に書き、`shape-latest.json` と比較して警告を標準出力に出す（ANON-10, ANON-11）。
3. `.gitignore` と `.dockerignore` に `.localdev/` を追加する。`.dockerignore` には `scripts/` と `tests/fixtures/` も追加する（ANON-8）。
4. 確認:
   - AC-12, AC-13: 正常終了・途中でエラー（不正な project ID）・Ctrl+C の3通りで、終了後に `gcloud auth list` が空、`application_default_credentials.json` がない、`firebase login:list` が空。事前にログインした状態で開始すると、まず削除されることをログで確認する。
   - AC-14: `FIRESTORE_EMULATOR_HOST=x npm run anonymize` が、ログインを始める前に拒否される。
   - AC-15: 実行中に `.localdev/` 以外への書き込みがないことを確認する（`strace -f -e trace=openat` で書き込みモードのオープンを見る、または `inotifywait -r` でリポジトリと `/tmp` を監視する）。
   - AC-16: `git check-ignore .localdev/data/guestInfoV2.json` が一致する。`docker build` したイメージで `find / -path '*localdev*'` が空。
   - AC-22: `meta.json` に匿名化した日がある。
   - AC-19（通し）: 匿名化 → 投入の後、Emulator 上の日付（破損した日付を含む）と部屋番号が元の値と一致する。元の値と比較できるのは実行中のメモリだけなので、`anonymize.ts` に「日付と部屋のパスの値が変換前後で一致するか」の自己検査を入れ、一致件数だけを出力する。投入後の一致は `serialize` の往復テストと投入スクリプトが値を変えないことで担保する。

### Phase 8: 本番鍵の無効化と PC の掃除（人手）

対応: OPS-2, OPS-3, OPS-4 / AC-27

Phase 4 が終わり、開発サーバーが本番鍵なしで動くようになったらすぐ行う。

1. Phase 0 で控えた SA の鍵を GCP で無効化し、問題がなければ削除する（`gcloud iam service-accounts keys disable/delete`）。その SA に開発以外の用途がないか先に確認する。
2. PC 上の `.env.development` のバックアップやエディタの履歴に鍵が残っていないか確認する。
3. `gcloud auth revoke --all`、`gcloud auth application-default revoke`、`firebase logout` を実行し、G-8 を解消する（AC-27）。以後、デプロイ時だけログインする（OPS-3）。

### Phase 9: ドキュメント更新と受け入れ確認

| ファイル | 更新内容 |
|---|---|
| `docs/LocalDevelopment.md` | 「（未実装）」の扱いを外し、§1.1 の変数名・コマンドへのリンクを追記 |
| `docs/CICD.md` | Local Environment 節（`npm run emulators` / `seed` / `dev`）、E2E の env を `playwright.config.ts` に集約した旨 |
| `docs/Test.md` | E2E の認証情報の節（demo project と Emulator 系の変数で起動する）、`tests/unit/localdev/` と `tests/fixtures/localdev/` |
| `docs/Security.md` | 起動ガード（DEV-2, PROD-1, PROD-2）、CSP の development 行、本番鍵を置かない方針 |
| `docs/Architecture.md` | ファイル構造に `instrumentation.ts`、`scripts/localdev/`、`.localdev/` |
| `GCP_SETUP.md` | 閲覧専用 SA の作成と権限付与、開発用の鍵を発行しないこと |
| `docs/BugHunting.md` | 発見済みの課題 #5 を「Emulator 化で解消」に更新。§5 の前提条件（Emulator とダミーデータ）が満たされた旨 |
| `AGENTS.md` | Test 節に `tests/unit/localdev/`、Security 節に「development は Emulator のみ」を1行ずつ |

最後に §4 の対応表で全 AC を確認し、手動確認の証拠（ログ、スクリーンショット、コマンド出力）を PR に貼る。

---

## 3. 未決事項

仕様に書かれていない、または解釈が分かれる点。実装前に決めて仕様に追記する。括弧内は推奨案。

| # | 論点 | 推奨案 |
|---|---|---|
| Q-1 | マスク対象のフィールドに Timestamp / GeoPoint / Reference / Bytes が来た場合の扱い（マスク表にない） | Timestamp は「日付はずらさない」に合わせてそのまま残す。GeoPoint は `(0, 0)`、Reference はパスの ID 部分を ID 振り直しの対応表で置換、Bytes は同じ長さの乱数 |
| Q-2 | 小数の「同じ桁数」の定義 | 整数部と小数部の桁数をそれぞれ保つ。整数部の先頭は 0 以外（整数部が `0` の場合は `0` のまま） |
| Q-3 | `country` のシャッフルにキー欠損のレコードを含めるか | 含めない。欠損は欠損のまま残す（形を保つ） |
| Q-4 | 振り直した ID の形式 | 元が UUID なら UUID v4、それ以外は元と同じ長さ・同じ文字の種類の乱数文字列。`''` と `null` は振り直さない。文字列以外（破損値）はマスクの規則を適用 |
| Q-5 | `々`、`ー`、`〆`、濁点の結合文字の分類 | `々` `〆` `ー` は記号としてそのまま残す。結合文字は直前の文字とまとめて1文字として扱わず、記号として残す |
| Q-6 | 「上記以外の文字」の全角・半角の判定 | Unicode East Asian Width の `F` / `W` を全角、それ以外を半角とする（範囲表を `mask.ts` に持つ） |
| Q-7 | 匿名化データがない新規の開発者の投入 | `npm run seed -- --fixture` で `tests/fixtures/localdev/` を投入できるようにする |
| Q-8 | 起動ガードで空文字の環境変数をどう扱うか | Phase 1 の推奨どおり（Emulator 系は空文字でも拒否、必須側は空文字を未設定扱い） |
| Q-9 | `firebaseAuthProvider.ts`（未使用）を残すか | 今回は `firebaseAuth` 経由に直して残し、削除は別 PR で判断 |

---

## 4. 受け入れ基準との対応

| AC | フェーズ | 確認方法 |
|---|---|---|
| AC-1〜4 | 1, 2 | unit test + 手動起動 |
| AC-5 | 2, 4 | 手動（ADC ログイン済みの PC で Emulator にだけ書かれる） |
| AC-6, AC-7 | 5 | 手動（ブラウザ + Emulator UI） |
| AC-8 | 3 | unit test + `npm run start` のヘッダー |
| AC-9 | 4 | CI の `e2e` job |
| AC-10, AC-11 | 1, 2 | unit test + `npm run start` |
| AC-12, AC-13 | 7 | 手動（3通りの終了） |
| AC-14 | 6, 7 | unit test（`guards.ts`）+ 手動 |
| AC-15 | 7 | 手動（`strace` / `inotifywait`） |
| AC-16 | 7 | `git check-ignore` + イメージ内の検索 |
| AC-17, AC-18 | 6 | unit test |
| AC-19 | 5, 6, 7 | unit test（allowlist、serialize 往復）+ 実行時の自己検査 |
| AC-20, AC-21 | 6 | unit test |
| AC-22 | 7 | 手動（`meta.json`） |
| AC-23, AC-24 | 6 | unit test |
| AC-25 | 5 | unit test（`guards.ts`）+ 手動 |
| AC-26 | 5 | 手動（2回投入して件数比較） |
| AC-27 | 8 | 手動（`gcloud auth list`, `firebase login:list`, ADC ファイル） |

---

## 5. PR の分け方（推奨）

レビューしやすさと、途中で本番鍵を早く消せることを優先する。

1. Phase 1〜4: 起動ガード、初期化、Auth 集約、CSP、Emulator 設定、E2E/CI（マージ後すぐ Phase 8）
2. Phase 5: 投入スクリプトと fixture
3. Phase 6〜7: 匿名化
4. Phase 9: ドキュメント（各 PR で関係する docs は都度更新し、最後に漏れを埋める）
