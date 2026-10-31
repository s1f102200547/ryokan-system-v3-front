# Bug Hunting Runbook

`docs/BugHunting.md` の方針を、1ステップずつ実行するための手順書。方針・リスクマップ（R1〜R8）・課題一覧（§5 の #1〜#15）は `BugHunting.md` を正とし、ここには「何をどの順で、どこまでやったら終わりか」だけを書く。

## 使い方

- 1セッション（または1 PR）で1ステップを進める。ステップ内の「完了条件」をすべて満たしてから次へ進む。
- ブランチは `development` から切る（`main` からは切らない）。PR の向き先も `development`。
- **コミットは人間が行う。** AI はコミットしない。コミット1単位分の変更がまとまったら、そこで止めて「変更ファイル・変更内容・コミットメッセージ案」を示し、人間の確認を待つ。
- **分からないこと・判断が必要なことは、推測で進めずに必ず質問する**（仕様、設計の選択肢、テストの期待値、実機で確認できなかった点など）。
- 各ステップの「指示例」は Claude Code にそのまま渡せる。渡す前に `AGENTS.md` と本書の該当ステップを読ませる。
- バグを見つけたら、直す前に `BugHunting.md` §5 の表に行を追加する（確認列は 実機 / コード / 仕様）。直したら「状態」を更新する。
- 1つ直すごとに「共通の締め」（末尾）を行う。

### 進捗

| Step | 内容 | 対象 # | 状態 |
|---|---|---|---|
| 0 | 準備とベースライン | — | 完了（候補 A〜F は確認でき次第 §5 へ移す） |
| 1 | #4 を Emulator で再現 | 3, 4 | 完了（再現した） |
| 2 | 予約の入口検証を Infra に揃える | 3, 4, 6, 7, 17, 19 | 完了 |
| 3 | 入力起因のエラーを 4xx にする | 1, 2, 5, 16, 18, 20 | 完了 |
| 4 | 往復検査と制約の突き合わせ | — | 完了（新しいバグは見つからず） |
| 5 | 全 Route Handler のファジング | — | 完了（新しいバグは見つからず） |
| 6 | TZ・時刻の固定テスト | 8, 9, 21 | 完了 |
| 7 | 仕様判断 | 10〜14, 22 | 完了 |
| 8 | PBT | — | 完了（新しいバグは見つからず） |
| 9 | 探索的テスト | 24, 25, 26 | 完了 |
| 10 | 状態遷移と競合 | 13 | 未着手 |

---

## Step 0. 準備とベースライン

**目的**: 「今どのテストが通っているか」と「Emulator で動くか」を確かめ、以降の変化を比べられるようにする。

**手順**

1. `development` から作業ブランチを切る（例: `fix/bug-hunting-step1`）。ステップごとに別ブランチ・別 PR にする。
2. `make check` を実行し、lint・型・unit/integration・E2E の結果を記録する。落ちているものがあれば、先にそれを §5 に載せる。
3. `make` で Emulator + 人工データ + 開発サーバーを起動し、`dev@example.com` / `dev-password` でログインする。デイリーダッシュボード・ゲスト情報・宿泊税テーブルが開けることを確認する。
4. 下の「コードを読んで見つかった追加の候補」を §5 に載せるか判断する（確認は各ステップで行う）。

**完了条件**: `make check` の結果と、Emulator で3画面が開けたことを PR か作業メモに残した。

### 実行記録（2026-10-31、ブランチ `fix/bug-hunter`、`development` の c38f7d4 から分岐）

| 項目 | 結果 |
|---|---|
| lint | 通過 |
| 型チェック | 通過 |
| unit / integration | 22 ファイル・335 件すべて通過 |
| E2E | 51 件すべて通過。初回はブラウザ未インストールで全件失敗（Playwright の更新 24bb97c 後に `npx playwright install chromium` が必要だった。テストの問題ではない） |
| `make` | 匿名化データ（`.localdev/data/`）を投入: guestInfoV2 3153 件、dailyInfo 481 件 |
| ログイン | `dev@example.com` で 200、`/` に遷移 |
| 画面・API | ゲスト情報（10/31）・宿泊税テーブル（10月）が表示された。`guest-info`・`daily/todos`・`timetable`・`cleaning-board`・`a-tax-table`（10月・11月）はすべて 200。ブラウザのエラーなし |
| サーバーログ | 確認した範囲で破損ドキュメントのスキップ・ERROR・ALERT なし |

### コードを読んで見つかった追加の候補

確認できたものは `BugHunting.md` §5 に移し、候補の列に移動先を書く。

| 候補 | 根拠 | 関係 |
|---|---|---|
| A | `PATCH /api/reservations/[id]` は `check_in_date` を受け取らないため、Route の Zod だけでは `check_out_date > check_in_date` を検査できない。#3 の修正には既存ドキュメントの読み取りが必要 | #3（Step 2 の設計に影響） |
| B（→ #3 に統合） | `ReservationModal.tsx` の `handleFieldChange` は泊数が 0 以下のとき配列をリサイズしないが、`check_out_date` 自体は送る。UI 経由でも #3 が起きる | #3, #4 |
| C（→ #18） | `useUpdateReservation` は 503 以外のすべての失敗に「管理者に通知済みです」と表示する。400 / 404 は通知されないため、Step 3 で 4xx を増やすと文言が事実と食い違う | Step 3 |
| D | `cancel` / `restore` の Command は「doc ID = reservation_number」とコメントしているが、`addReservation` は `.add()` で自動 ID を振るため、手動追加の予約は doc ID と `reservation_number` が一致しない。どこかで `reservation_number` を ID として使っていないか確認する | R1 |
| E | `PATCH` の `mail_memo` は配列ごと上書きできる。操作履歴（キャンセル・復活の記録）を画面から消せる。意図した仕様か確認する | 仕様 |
| F（Step 1 で追加済み） | 人工データ（`tests/fixtures/localdev/guestInfoV2.json`）に `check_out_date <= check_in_date` のドキュメントがない。#4 の経路を `make` だけでは通らない | #4 |

---

## Step 1. #4 を Emulator で再現する

**目的**: 最優先の課題（泊数 0 以下の予約 1 件で前後 30 日の画面がすべて 500 + ALERT）を、コードの推測ではなく実機で確かめる。

**手順**

1. 再現経路を2つ試す。
   - **UI 経路**: 予約モーダルの C/O 日を DatePicker にキーボードで直接入力し、C/I 日と同日・前日にする。保存が 200 で返るか、ネットワークタブで確認する。
   - **データ経路**: fixture に `check_in_date: "2026/11/10"`, `check_out_date: "2026/11/10"`（同日）と、逆転（`"2026/11/12"` → `"2026/11/11"`）の2件を追加し、`make seed` で入れ直す（候補 F）。
2. その日付の前後 30 日にあたるデイリーダッシュボード（ゲスト情報・タイムテーブル・清掃ボード）を開き、HTTP status とサーバーログを記録する。期待される再現結果: `RangeError: Invalid array length` で 500。
3. 宿泊税テーブル（その月）も開く。`fetchByMonth` も同じ `toReservation` を通るため、同じく落ちるはず。
4. 結果を §5 の #3・#4 の「確認」列に反映する（コード → 実機）。

**完了条件**: 再現の有無と、再現した画面・status・ログを記録した。fixture の追加は Step 2 の修正と同じコミットに含める（先にコミットすると、fixture で開発する環境が Step 2 まで壊れるため）。

### 実行記録（2026-10-31、匿名化データ + fixture）

| 経路 | 操作 | 結果 |
|---|---|---|
| UI | 部屋22（C/I 10/31・C/O 11/02）の C/O をキーボードで 10/31 に | `PATCH {"check_out_date":"2026-10-31"}` が 200。泊数 0 は読み取りで例外にならず、全画面 200 |
| UI | 部屋31（C/I 10/31・C/O 11/03）の C/O を月だけ打ち替えて 10/03 に | 200 で保存。直後から 10/01〜11/30 のタイムテーブル・清掃ボード、10/31〜11/30 のゲスト情報、10月の宿泊税が **503**。ログは `Firestore unknown error`（`FIRESTORE_UNAVAILABLE`）のみ。Infra を直接呼ぶと cause は `RangeError: Invalid array length` |
| UI | 部屋32 の C/O の日だけ `31` と打つ（11/31） | 入力途中の `11/03` で配列が3泊分にリサイズされ、`"Invalid Date"` と一緒に送られて 400。画面には「管理者に通知済みです」 |
| データ | fixture に `fixture-corrupted-zero-nights`（11/10→11/10）と `fixture-corrupted-reversed-dates`（11/12→11/11）を追加して `npm run seed -- --fixture` | 10/13〜12/12 のタイムテーブル・清掃ボード、11/12〜12/12 のゲスト情報、11月の宿泊税が 503。範囲外（10/12、12/13）は 200 |

- 予想との違い: status は 500 ではなく 503（`RangeError` が `withFirestoreError` で障害扱いになる）。泊数 0 では落ちず、負のときだけ落ちる。
- 部屋31 は API で C/O を 11/03 に戻し、Emulator は `make seed` で匿名化データに戻した。
- 新たに見つかったもの: #16（元の例外がログに出ない）、#17（DatePicker の入力途中の値が保存される）、#18（400 でも「管理者に通知済み」）。

**指示例**
> docs/BugHuntingRunbook.md の Step 1 を実行して。make で起動した Emulator 上で #4 を UI 経路とデータ経路の両方で再現し、status とログを記録して BugHunting.md §5 を更新して。本番の Firestore には触らないこと。

---

## Step 2. 予約の入口検証を Infra に揃える（#3・#4・#6・#7）

**目的**: 「受け付けたのに読み戻すと消える／壊れる」を入口で止める。読み取り側では、壊れた1件が全体を巻き込まないようにする。

**設計（実装前に決める）**

1. **許容値を1か所に集める。** `firestoreReservationRepository.ts` の `ARRIVAL_TIME_VALUES` などを `src/constants/` に移し、Route の Zod・Infra の Zod・UI の選択肢（`src/constants/guestInfo.ts`）がそれを参照する（AGENTS.md「定数は constants/」）。UI の選択肢がこの許容値の部分集合になっているかも確認する。
2. **値の検査は Route で行う。** `PatchBodySchema` の `arrival_time`・泊別配列の要素・`age_groups` の要素を、1 の許容値の enum にする。
3. **泊数・長さの検査は既存ドキュメントが必要**（候補 A）。案:
   - Port に `fetchById(id)` を追加し、`updateReservationCommand` が読み取り → Domain の純粋関数で検査 → 書き込みを行う。
   - 検査は Domain の関数（例: `validateReservationPatch(current, patch): Result<...>`）に置き、例外ではなく Result で返す。Route は失敗を 400 にする。
   - 検査する内容: 更新後の `check_out_date > check_in_date`、泊別配列の長さ = 更新後の泊数、`age_groups` の長さ = 更新後の `adult_count`。
   - 読み取り・検査・書き込みは `runTransaction` で囲む（2026-10-31 決定）。囲まないと、検査と書き込みの間に別のタブで C/O が変わったとき、泊数と長さの合わない配列が保存され、読み戻すと入力が初期値に戻る。#13（古い画面からの上書き）はこれでは解決しないので Step 7 で扱う。
4. **日付は実在日と範囲を見る。** POST / PATCH / cancel / restore の日付を `dateSchema.ts` の検査（実在日・範囲）に揃える。範囲チェックは書き込みにも入れる（2026-10-31 決定）。画面からは範囲外の予約を開けないため実害はなく、年の打ち間違い（約 13,000 泊の予約など）を止められる。泊数の上限は #12 と合わせて Step 7 で決める。
5. **読み取りの防御。** `toReservation` で泊数が 0 以下なら `FIRESTORE_DATA_CORRUPTION` を投げる（スキップの対象にする）。

**手順**（AGENTS.md の縦断順）

1. 回帰テストを先に書き、落ちることを確認する。
   - `tests/unit/`: Domain の検査関数（同日・逆転・1泊・長さ違い・`adult_count` 0）。
   - `tests/unit/`: `toReservation` を export し、泊数 0 / 負 で `FIRESTORE_DATA_CORRUPTION` になること。
   - `tests/integration/api/reservations/[id]/route.test.ts`: 許容値外の `dinner_time`、`arrival_time: "6:00"`、`check_out_date: "2026-02-30"` が 400。
   - `tests/integration/api/reservations/route.test.ts`: 実在しない日付が 400。
2. Domain → Infra → Application → Route の順に実装する。
3. UI 側: C/O 日が C/I 日以前のときに送信しない（DatePicker の入力も含む）。400 時の文言を Step 3 と合わせて決める。
4. Step 1 の fixture で、画面が 500 にならず、壊れた予約だけがスキップされることを実機で確かめる。

**完了条件**: 回帰テストが通る / Step 1 の再現手順で 500 が出ない / §5 の #3・#4・#6・#7 を「対応済み」にした / 共通の締めを行った。

### 実行記録（2026-10-31）

追加の決定（質問への回答）:
- 存在しない予約への PATCH は、トランザクションの読み取りで分かるので 404 にする（Slack 通知なし）。
- C/O 日の入力欄は、実在しない日付と C/I 以前の日付を保存しない（入力欄は MUI の検証で赤枠）。
- 泊数・大人の人数が変わるのに配列が送られてこない更新は 400。
- DB の C/O が壊れている予約も、正しい C/O と泊別配列を送れば直せる。

| 確認 | 結果 |
|---|---|
| 回帰テスト | Domain 22 件、`toReservation` 4 件、Route（PATCH / POST / cancel / restore）、E2E 3 件を追加。修正前に落ちることを確認（E2E は画面の修正だけを戻して2件が落ちる） |
| Step 1 の UI 経路 | C/I 以前の日付は PATCH を送らない。実在しない日付も送らない。前後の画面はすべて 200 |
| Step 1 のデータ経路 | fixture で 503 だった日付がすべて 200。壊れた3件は `Skipping corrupted doc` で読み飛ばし |
| API | 存在しない ID は 404、逆転した C/O は 400（`CHECK_OUT_NOT_AFTER_CHECK_IN`）、長さ違いは 400（`NIGHT_FIELD_LENGTH_MISMATCH`）、壊れた予約の C/O 修正は 200 で再表示 |

- 新たに見つかったもの: #19（C/O 日を1文字ずつ打つと、途中の短い泊数で泊別配列が切り詰められ、入力が消える。修正前からある）。
- #19 の直し方（質問への回答）: 案A。モーダルを開いている間、泊別配列と `age_groups` の「いちばん長かったときの値」を覚えておき（`nightArrays.ts` の `rememberArrayFields`）、泊数・人数を伸ばし直したら戻す。入力途中の短い泊数は一度保存されるが、最後の保存で戻る。案B（入力欄から離れたときだけ保存）は、カレンダーで選び直すと消える問題が残り、MUI に blur 時の通知がないため見送った。
- #19 の確認: unit 6 件・E2E 1 件を追加し、修正前に落ちることを確認。Emulator で 2泊（11/02）の日に `1` `5` と打ち、読み戻した 11/15 の予約に2泊目の夕食 18:00 とメモが残っていた。

**指示例**
> docs/BugHuntingRunbook.md の Step 2 を実行して。まず「設計」の 3 と 4 について選択肢を出して私に確認してから実装に進んで。テストを先に書いて落ちることを見せること。

---

## Step 3. 入力起因のエラーを 4xx にする（#1・#2・#5）

**目的**: 不正な入力で 5xx と Slack [ALERT] が出ないようにし、ALERT を「人が対応しないと直らない障害」に絞る。

**手順**

1. **#1**: `POST /api/auth/login` の `request.json()` を他の Route と同じく `.catch(() => null)` にする。回帰テスト: 不正な JSON・空 body で 400。
2. **#2**: `verifyIdToken` の `auth/argument-error` を認証失敗（401、ALERT なし、WARN ログ）に分類する。Context7 で firebase-admin v13 のエラーコード一覧を確認し、入力が原因のコードを漏れなく入れる。回帰テスト: 形式が不正な idToken で 401、Slack を呼ばない。
3. **#5**:
   - `[id]` を Zod で検証する共通スキーマを作る（空でない、`/` を含まない、`.` と `..` でない、`__.*__` でない、1500 バイト以下）。cancel / restore / a-tax / PATCH の4 Route で使う。
   - `withFirestoreError` で gRPC code 5（NOT_FOUND）を新しい `InfraErrorCode`（例: `FIRESTORE_NOT_FOUND`）に分類し、404・ALERT なしにする。`infraErrorToHttpStatus.ts` と `docs/ErrorHandling.md` の表を更新する（AGENTS.md の規則）。`handleRouteError` に「通知しないコード」の分岐を入れる。
   - 回帰テスト: 不正な `[id]` で 400、NOT_FOUND で 404 かつ Slack を呼ばない。
4. **Hooks の文言**（候補 C）: 400 / 404 / 503 / その他を出し分ける。400・404 で「管理者に通知済み」と言わない。
5. 境界に触れる変更なので、Emulator で実際に存在しない ID へ PATCH し、404 になることを確かめる（BugHunting.md §3.6）。

**完了条件**: 回帰テストが通る / 実機で 404 を確認 / ErrorHandling.md 更新 / §5 更新 / 共通の締め。

### 実行記録（2026-10-31）

決定（質問への回答）:
- #2: firebase-admin 13.10 は不正なトークンにも公開鍵の取得失敗にも `auth/argument-error` を返す。メッセージが `Decoding Firebase ID token failed` / `Firebase ID token ` で始まるものだけを 401 にし、それ以外は 503 + 通知。公開鍵の取得失敗は HTTP エラーなら `Error fetching ...`、接続エラーなら生のメッセージ（`connect ETIMEDOUT` など）になるため、障害側を数え上げず、不正なトークン側を数え上げた。
- #5: `FIRESTORE_NOT_FOUND`（404・通知なし・WARN）を追加。Firestore の例外の変換は `src/infra/firestoreError.ts` に1つにまとめた（2つの Repository に同じ関数があった）。
- #18: 400 / 404 の文言は案どおり。10 個のフックの文言を `src/hooks/httpErrorMessage.ts` にまとめた。

| 確認 | 結果 |
|---|---|
| 回帰テスト | unit（`idTokenError`・`firestoreError`・`infraErrorToHttpStatus`・`httpErrorMessage`・`logger`）、integration（ログイン、`[id]` の4 Route）を追加し、修正前に落ちることを確認 |
| ログイン（実機） | 不正な JSON・空の body は 400、形式が不正な idToken は 401 |
| `[id]`（実機） | 存在しない ID は PATCH・cancel・restore・a-tax のすべてで 404、ログは WARN で `cause` に `5 NOT_FOUND`、Slack 通知なし。`a%2Fb`・`__x__` は 400（`..` は URL の正規化で Route に届かない） |

- 新たに見つかったもの: #20（`logger` の `extra.message` がログの本文を上書きしていた）。#16 と同じく「ログから原因が追えない」ので Step 3 で直した。

**指示例**
> docs/BugHuntingRunbook.md の Step 3 を実行して。firebase-admin のエラーコードは Context7 で確認すること。InfraErrorCode を追加するなら AGENTS.md の規則どおり関連ファイルと doc も更新して。

---

## Step 4. 往復検査と制約の突き合わせ（BugHunting.md §3.1・§3.2）

**目的**: 今のテストが通していない「Route が受け付けた値を書いて、読み戻す」経路をテストにする。

**手順**

1. **Emulator 用の Vitest 設定を分ける。** 既存の `vitest.config.ts` は到達不能な Emulator（`127.0.0.1:1`）を向いているので変えない。別の設定（例: `vitest.emulator.config.ts`、対象は `tests/emulator/`）で `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`・`demo-` project を指定し、`firebase emulators:exec` の中だけで実行する npm script を作る。起動ガード（`runtimeEnvGuard`）を通ること、本番や ADC に届く経路がないことを確認する。
2. **往復検査**（`tests/emulator/`）:
   - Route の Zod が受け付ける patch を生成し、書いて `fetchByDateRange` で読み戻すと、patch の値がそのまま返る（fallback に化けない）。
   - どんな patch を書いても `fetchByDateRange` が throw しない。
   - 壊れたドキュメントを1件混ぜても、他の予約が取得できる。
3. **制約の突き合わせ**（`tests/unit/`）: フィールドごとに「UI の選択肢 ⊆ Route の Zod が通す値 ⊆ Infra が fallback に変えない値」を検査する。Step 2 で許容値を `constants/` に集めていれば、ほぼ自動で通る。通らないフィールドは §5 に載せる。
4. CI に Emulator ジョブを追加するか決める。追加するなら `.github/workflows/ci.yml` と `docs/CICD.md` を同時に更新する（AGENTS.md）。`docs/Test.md` に層の説明を追加する。

**完了条件**: 往復検査と突き合わせのテストがローカルで通る（または見つかったバグが §5 に載っている）/ 実行方法が `docs/Test.md` にある。

### 実行記録（2026-10-31）

決定（質問への回答）: Emulator の往復検査は CI に `emulator-test` ジョブとして追加し、`make check` にも含める。

| 作ったもの | 内容 |
|---|---|
| `vitest.emulator.config.ts` / `npm run test:emulator` | `firebase emulators:exec` で専用の Firestore Emulator を起動して `tests/emulator/` を実行。通常の Vitest からは除外 |
| `tests/emulator/reservationRoundTrip.test.ts`（117 件） | PATCH: 許容値の全値・自由入力の境界・泊数の変更を書いて、画面と同じ読み取り経路で読み戻す。POST: 予約サイト4種。壊れたドキュメント 11 種を同じ日に入れても正常な予約が取れる |
| `tests/unit/constraints/reservationConstraints.test.ts`（360 件） | UI の選択肢（UI が送る形）→ Route の Zod → Infra の読み取り、の3か所で値が消えないこと |
| `src/lib/api/reservationSchemas.ts` | 予約 API の Zod を Route ファイルから移した（Route ファイルは HTTP メソッド以外を export できないため） |
| `src/constants/guestInfo.ts` | 新規追加ダイアログの予約サイト・人数の選択肢をコンポーネントから移した（AGENTS.md「定数は constants/」） |

- 結果: どちらも全件通過。Step 2 の修正後は、受け付けたのに読み戻すと変わる値は見つからなかった。
- 検査の効き目の確認: 到着時刻の許容値から `22:00` を消すと突き合わせが、読み取り側のゲスト名の上限を 50 文字にすると往復検査が、その1件だけ落ちることを確かめた（確認後に元へ戻した）。
- 仕様として扱ったもの: `country`・`group_type`・`purpose`・`tourism_type`・`age_groups` の `''` は読み取りで `null` に正規化される（`docs/Schema/Reservations.md` の仕様）。UI は `''` を `null` にして送るので、検査は UI が送る形で行った。
- 既存の食い違い（未対応）: `docs/CICD.md` と AGENTS.md は「CI は `main` への PR / push で実行」とあるが、`ci.yml` は `development` でも実行する。

---

## Step 5. 全 Route Handler のファジング（BugHunting.md §3.3）

**目的**: 「入力が原因で 5xx を返さない、ALERT を鳴らさない」を全 Route で機械的に確かめる。

**手順**

1. `tests/utils/` に、Route Handler と入力の組を受け取り「status < 500 かつ `notifySlackFireAndForget` が呼ばれない」を検査する共通ヘルパーを作る。Application / Infra は mock し、`verifySession` は認証済みにする。
2. 入力の一覧（BugHunting.md §3.3）を fixture として1か所に置く: 不正 JSON・空・`null`・配列・型違い・巨大な文字列と配列・負数・小数・日付の異常値・`[id]` の異常値。
3. `src/app/api/` の全 Route（12 ファイル、GET / POST / PATCH）に適用する。Route の一覧はテスト内で列挙し、Route を追加したときに漏れないよう `src/app/api/**/route.ts` の数と一致することも検査する。
4. Emulator 版（Step 4 の設定）では、存在しない ID・不正な ID が 404 / 400 になることを確かめる（R5）。

**完了条件**: 全 Route でファジングが通る、または失敗が §5 に載って直っている。

### 実行記録（2026-10-31）

| 作ったもの | 内容 |
|---|---|
| `tests/utils/fuzzInputs.ts` | 入力の一覧（生の body 14 種、フィールドの値 19 種、`[id]` 11 種、日付 11 種、数値の query 11 種） |
| `tests/integration/fuzz/routes.fuzz.test.ts`（871 件） | mock 版。全 12 Route・14 メソッドについて、正しい入力から1か所ずつ壊す。`src/app/api/**/route.ts` を走査して、対象の漏れも検査する |
| `tests/emulator/routes.fuzz.test.ts`（241 件） | Emulator 版。`[id]` を取る4 Route の ID、予約の更新の body、日次データの `[date]`、ログイン（Auth Emulator の `verifyIdToken`） |

- 結果: どちらも全件通過。Step 2・3 の修正後は、入力が原因の 5xx・通知は見つからなかった。
- 検査の効き目の確認: ログインの `request.json()` の catch（#1 の修正）を外すと、mock 版で「空」「不正な JSON」「途中で切れた JSON」の3件だけが落ちることを確かめた（確認後に元へ戻した）。
- 分かったこと: 空白・NUL 文字・`%2F` という文字列は、Firestore のドキュメント ID として有効。これらは入口で拒否せず、存在しなければ 404 を返す（期待値をそう分けた）。
- `npm run test:emulator` は Auth Emulator も起動するようにした（ログインのファジングのため）。

---

## Step 6. TZ・時刻の固定テスト（BugHunting.md §3.4、#8・#9）

**目的**: 実行環境の TZ や時刻で結果が変わるバグを、CI（UTC）でも開発 PC（JST）でも見つけられるようにする。

**手順**

1. `TZ` はプロセス起動時に決まるので、`TZ=UTC` / `TZ=Asia/Tokyo` / `TZ=America/Los_Angeles` の3回に分けて Vitest を実行する npm script を作る（CI では matrix）。
2. 対象: `dateUtils`（`addDays`・`dateDiff`）、`dateSchema`（`isRealDate`・`isInRange`）、各 UseCase、`computeProcessedRows`、`addReservationCommand` の `mail_memo` の月日、`msUntilToday23JST`、`proxy.ts` の時間帯判定。
3. `vi.useFakeTimers()` で JST 5:59 / 6:00 / 8:59 / 9:00 / 22:54 / 22:56 / 23:00 / 0:00 を通す。日付は月末・年末年始・閏年 2/29・`DATE_RANGE_*` の端と1日外。
4. 判定は「TZ によって結果が変わらない」。落ちたものを §5 に載せる（#8・#9 の確認列を更新）。
5. 直し方の方針: 日付文字列の計算は `Date.UTC` と `getUTC*` に統一し、「今日」は `getTodayJST()` だけから得る。`new Date('YYYY-MM-DD')` とローカル時刻の比較をやめ、文字列（`YYYY-MM-DD`）で比較する。

**完了条件**: 3つの TZ で同じ結果になる / #8・#9 が直っている / CI の matrix を入れた場合は `docs/CICD.md` も更新した。

### 実行記録（2026-10-31）

| 作ったもの | 内容 |
|---|---|
| `npm run test:tz` | `tests/time/` を `TZ=UTC` / `Asia/Tokyo` / `America/Los_Angeles` で3回実行。CI の `unit-test` と `make check` に追加 |
| `tests/time/`（124 件 × 3 TZ） | `getTodayJST`・`addDays`/`dateDiff`（月末・閏日・夏時間の切り替え日）、`DateSchema` の範囲の端（JST の境界時刻ごと）、手動追加の操作履歴の月日（#8）、宿泊税テーブルの対象月、Session Cookie の期限（22:54 / 22:56 / 23:00 など）、時間帯制限（5:59 / 6:00 / 23:00）、UseCase の取得窓 |
| `tests/utils/timeHelper.ts` | JST の日時で時刻を固定する `setNowJST` と境界時刻の一覧 |

修正前の結果:
- #8: `TZ=UTC` と `America/Los_Angeles` で、JST 0:00〜8:59 の手動追加が前日の日付になった（Cloud Run は UTC）。
- #9: `TZ=Asia/Tokyo` でも、JST 0:00〜8:59 は「今日」が前日になり、今日の行が出なかった（`toISOString()` が UTC）。`TZ=UTC` ではさらに、未受領の日からの範囲もずれた。ただし、このフィルタは画面から呼ばれていない（`ATaxTable.tsx` は常に `enableFilter=false`）。
- Session Cookie の期限、時間帯制限、`addDays` / `dateDiff`、`DateSchema`、UseCase の取得窓は、修正前から3つの TZ で同じ結果だった。

直し方: 「今日」は `getTodayJST()` だけから得て、日付は `YYYY-MM-DD` の文字列のまま比べる。操作履歴の月日は `toMonthDay()`（`dateUtils.ts`）にまとめ、手動追加・キャンセル・復活・画面の履歴追加で共通にした。宿泊税テーブルの今月・先月は `monthlyTarget(option, today)` に切り出した。宿泊税テーブルの今月フィルタ（`computeProcessedRows` の `enableFilter`）は画面から使われていなかったので、質問への回答（案A）に従って削除した。印刷時刻は `timeZone: 'Asia/Tokyo'` で表示する。

- 新たに見つかったもの: #21（ブラウザのローカル時刻に依存する箇所。端末が JST なら問題は出ない）。
- 実機での確認はしていない。サーバーの時刻を JST 0:00〜9:00 にずらして動かす手段がないため、テストで固定した時刻と3つの TZ で確認した。

---

## Step 7. 仕様判断（#10〜#14）

**目的**: コードだけでは正誤を決められない課題を、人間が決める。AI は判断材料をまとめるだけにする。

**手順**

1. 各課題について「選択肢・それぞれの影響・実装の大きさ」を1行ずつ並べた判断表を作り、人間に確認する。

| # | 決めること | 選択肢の例 |
|---|---|---|
| 10 | 破損ドキュメントのスキップを通知するか | WARN ログのみ / 件数を集計して日次で Slack / 画面に「表示できない予約があります」 |
| 11 | ダブルブッキングをどう扱うか | 書き込み時に拒否 / 許して清掃ボードに警告 / 現状維持 |
| 12 | 31 泊以上の滞在はあり得るか | 窓を広げる / 上限を設けて入口で拒否 / 現状維持 |
| 13 | 同時編集の対策 | 楽観ロック（`updated_at` 比較）/ フィールド単位の更新 / 現状維持（KnownIssues に残す） |
| 14 | 時間帯制限を API にも適用するか | `/api/auth/login` だけ制限 / 全 API / 現状維持 |
| 候補 E | `mail_memo` を画面から上書きできてよいか | 追記のみにする / 現状維持 |

2. 決まったものは Step 2 と同じ縦断順で実装し、決定は `BugHunting.md` §5 と関連 doc（`KnownIssues.md`・`Security.md` など）に残す。

**完了条件**: 全項目に決定（「現状維持」を含む）と理由が記録されている。

### 実行記録（2026-10-31）

判断材料（匿名化データ。部屋・日付・キャンセル・取り込み元は本番のまま）:
- 泊数: 1〜13 泊がほとんどで、2025-04-01→2026-07-31 の 486 泊（手動追加・キャンセルなし）が1件だけある。
- ダブルブッキング: 442 部屋・泊。ほとんどは 486 泊の予約との重なりで、それを除くと約 13 組、今日以降は 3 組。

| # | 決定 | 理由 | 実装 |
|---|---|---|---|
| 10 | WARN ログ（取得ごと）。Slack には通知しない | 読み飛ばした予約は空室に見え、ダブルブッキングにつながるので人が直す必要がある。データの異常は障害ではなく、通知すると本物の障害が埋もれる（最初は「Slack は同じ ID につき1日1回」で実装したが、取りやめた） | `src/lib/skippedReservationReporter.ts`。Infra の読み取りから呼ぶ |
| 11 | ダッシュボードに警告（保存は止めない） | 予約の大半は Gmail 取り込みが書くので、このアプリだけでは止められない。清掃ボードは印刷物だけなので、画面はダッシュボードにした | `src/domain/room/roomConflicts.ts`、ゲスト情報 API の `roomConflicts`、`GuestInfoSection` の警告 |
| 12 | 30 泊を上限にする | 取得窓（前後 30 日）を超える滞在は表示されない。486 泊の予約は誤入力か部屋の押さえと見て、読み飛ばし（#10 で WARN ログ）とした | `MAX_NIGHTS`。Domain の検査・POST の Zod・Infra の読み取り・C/O 日の DatePicker の上限 |
| 13 | 現状維持 | 同じ予約を同時に開くことはまれ | `KnownIssues.md` |
| 14 | ログイン API だけ時間外は 403（本番） | 深夜に API を直接呼んで Cookie を得られないようにする。他の API は Cookie が 23:00 に切れる | `src/lib/businessHours.ts` を proxy と共有。ログイン画面に「利用時間外です」 |
| 候補 E | 仕様どおり（画面から操作履歴を編集・削除できる） | 画面に削除ボタンと確認がある | `docs/Schema/Reservations.md` に記載 |
| 候補 D | バグではない | `reservation_number` を ID として使う箇所はなく、コメントだけが誤り | キャンセル・復活の Command のコメントを直した |
| 22 | 使われていないので削除 | 清掃ボード API の `unassignedReservations` はどの画面にも表示されていなかった | 型・UseCase・テストから削除 |

追加（Step 7 の後）:
- #10 は Slack に通知しないことにした（WARN ログだけ）。
- #23: Slack の通知の一覧を洗い出したときに、各 Route がセッションの確認を try の外で呼んでいることに気付いた。Auth Emulator を止めると Session Cookie の確認は `app/network-error` になり、`AUTH_UNAVAILABLE` が投げられて全 API が 500（ログ・通知なし）になることを確かめた。`requireSession` で `handleRouteError` を通すようにし、`verifySession` が未ログインにするコードを限定した。実機で Emulator を止めると、503 と ERROR ログ（API 名と原因つき）になることを確認した。全 13 ハンドラーの「障害で 503 + 通知」「未ログインで 401」をファジングのテストに足した。

確認: Domain（`roomConflicts`・30 泊）、`toReservation`（31 泊）、POST（30 泊は 201、31 泊は 400）、読み飛ばしの WARN ログ（Slack には通知しない）、ログインの時間帯（5:59 / 6:00 / 22:59 / 23:00、3つの TZ）、E2E（ダッシュボードの警告、31 泊以上の C/O を保存しない）を追加し、修正前に落ちることを確認した。Emulator の往復検査に「31 泊」の破損と「読み飛ばしで Slack に通知しない」を足した。

---

## Step 8. PBT（BugHunting.md §3.5）

**目的**: 想定外の入力で単純な性質が崩れないかを大量に試す。

**手順**

1. `fast-check` を devDependency に追加する（`npm run audit:ci` が通ることを確認）。
2. 性質は `BugHunting.md` §3.5 の候補から取る。**コードを読んで性質を作らない**（バグに合わせた性質になるため）。
3. Infra の `toReservation` の性質は、任意の `DocumentData` を生成して「throw するのは `FIRESTORE_DATA_CORRUPTION` だけ」「配列の長さが泊数・`adult_count` と一致」を見る。
4. 失敗したら、md に根拠があれば実装のバグ、なければ仕様の穴として Step 7 の表に追加する。最終判断は人間が行う。

**完了条件**: 候補の性質がテストになっている / 失敗は分類して記録した。

### 実行記録（2026-10-31）

`fast-check` 4.10 を devDependency に追加した（`npm run audit:ci` は通過）。

| 性質（出どころ） | テスト | 試行回数 |
|---|---|---|
| `dateDiff(a, addDays(a, n)) === n`、`addDays` の合成、結果が実在日（§3.5） | `tests/time/dateProperties.test.ts`（3つの TZ で実行） | 1000〜2000 |
| どんなドキュメントでも、読めたら泊別配列は泊数・`age_groups` は大人の人数と同じ長さで、値はすべて許容値、泊数は 1〜30。読めなければ `FIRESTORE_DATA_CORRUPTION` だけ（§3.5） | `tests/pbt/reservationData.pbt.test.ts` | 3000 |
| 更新の検査を通った patch は、DB に重ねて読み直しても同じ値（§3.1「受け付けたものは消えない」） | 同上（検査を通った入力が 600 件以上あることも確かめる） | 3000 |
| 伸ばして縮めると元に戻る。記憶があれば縮めて伸ばしても元に戻る（§3.5、#19） | 同上 | 100 |
| 対象日に滞在中か C/I の有効な予約があれば空室ではない。滞在中は C/I 日でも C/O 日でもない（§3.5） | `tests/pbt/stay.pbt.test.ts` | 1000 |
| 重複と報告した部屋は有効な予約が2件以上、しなかった部屋は1件以下（#11 の決定） | 同上 | 1000 |
| 宿泊税の「大人×泊」の和は、対象の予約の大人×泊の和と一致。キャンセル済みは含まない。C/I 日ごとに最後の行は1行（§3.5） | 同上 | 1000 |

- 結果: すべて通過。Step 2〜7 の修正後は、性質に反する入力は見つからなかった。
- 検査の効き目の確認: `toReservation` の「泊数 0 以下は破損」（#4）を外すと `C/I = C/O = 2000/01/01` が、更新の検査の 30 泊の上限（#12）を外すと「31 泊への延長」が、最小の反例として見つかった（確認後に元へ戻した）。
- 最初の版では、更新の検査を通る入力が 3000 件中 64 件しかなく、性質がほとんど何も確かめていなかった。配列の長さを多くは正しい長さで作るように生成器を直し、通過件数の下限を検査に入れた。

---

## Step 9. 探索的テスト（BugHunting.md §3.6）

**目的**: テストが想定していない使い方で壊れる箇所を、実際に操作して見つける。

**手順**

1. `make` で Emulator を起動する。**本番の Firestore には繋がない。** 実データは使わない。
2. チャーター（BugHunting.md §3.6 の一覧）を1回に1つ選び、Playwright MCP または手で操作する。1チャーター 30 分程度を目安にする。
3. 記録すること: 操作手順、期待（ユーザーならこう動くと思う）、実際、スクリーンショットか HTTP レスポンス。
4. 見つけたものは再現を確認してから §5 に載せ、Step 2 と同じ流れで直して回帰テスト（画面操作なら `e2e/`）にする。
5. 終わったチャーターに日付を付けて、次回は別のチャーターから始める。

**完了条件**: すべてのチャーターを1周した。以後は機能追加のたびに関連するチャーターを再実行する。

### 実行記録（2026-10-31、Emulator + 匿名化データ、Playwright で操作）

| # | チャーター | 結果 |
|---|---|---|
| 1 | C/O 日を直接入力（C/I 以前・同日・遠い未来） | Step 1・2 で確認済み（保存しない・前後の画面は 200） |
| 2 | 泊数を伸ばす・縮める | Step 2・#19 で確認済み（再読み込み後も各泊の入力が残る） |
| 3 | 大人を 0 人・9 人 | 問題なし。年代の欄は 0 個・9 個になり、再読み込み後も同じ |
| 4 | 2タブで同じ予約を編集・保存中に閉じる・ネットワークを切る | 保存中に閉じても保存される。2タブでは後から保存した側が配列ごと上書き（#13、現状維持の決定どおり）。**オフラインで保存に失敗した変更は再送されず消える（#24）** |
| 5 | キャンセル → 復活 → キャンセルの繰り返し・キャンセル済みの編集 | **同じ日・同じスタッフ・同じ理由だと2回目以降の履歴が残らない（#25）**。キャンセル済みの予約は編集できる（200） |
| 6 | 月をまたぐ連泊・31 泊以上 | 「◯/◯泊目」・清掃ボードの連泊は正しい。宿泊税は全泊分が C/I の月に入る（10/31→11/3 は 10 月に3泊分）。仕様の確認が必要。31 泊以上は Step 7 で上限を設けた |
| 7 | 部屋未定・同じ部屋に2件 | 同じ部屋に2件は Step 7 の警告で表示される。**部屋未定の予約はタイムテーブルと清掃ボードに出ない（#26）** |
| 8 | 宿泊税テーブルを月初・月末・JST 6:00〜9:00 に開く | ブラウザの TZ を UTC にして JST 11/1 7:00・10/31 23:30 で開き、どちらも JST の今月・先月になった（Step 6 の修正が効いている） |
| 9 | 印刷（長いゲスト名・7部屋埋まり） | タイムテーブル: 100 文字の名前は枠内で「…」に省略、長いメモは折り返して欠けない。清掃ボード: 縦書きの列見出しが切れて見えたが、画面幅 1400px での印刷モードの画像なので、実際の用紙での印刷で確認が必要 |

- 操作で変えたデータは `make seed` で戻した。

決定（質問への回答）と対応:
- #24（保存の失敗）: 送り直す＋閉じる前に確認。保存の結果を「保存済み・送り直す（通信エラー・5xx）・捨てる（400・404 など）」に分け、送り直すものは保留に戻して、次の入力か「閉じる」で送る。送り直しても失敗したら「保存できていない変更があります。閉じますか？」と確認する。保存は前の保存が終わってから1件ずつ送る（応答の順序の入れ替わりも防ぐ）。E2E 3 件を追加（修正前に2件が落ちることを確認）。実機でオフライン → オンラインに戻して閉じると、送り直されて保存された。
- #25（履歴が消える）: `arrayUnion` をやめ、トランザクションで読んで末尾に追加する。存在しない予約は `FIRESTORE_NOT_FOUND`（404）。Emulator の往復検査に「同じ内容で5回繰り返すと履歴が5件増える」を追加（修正前に落ちることを確認）。
- #26（部屋未割り当て）: 現状維持。`KnownIssues.md` に記録。
- 月をまたぐ連泊の宿泊税: 仕様どおり（C/I の月に全泊分）。`docs/Schema/Reservations.md` に記載。

---

## Step 10. 状態遷移と競合（BugHunting.md §3.7）

**目的**: 1回ずつの操作では出ない、順序と競合のバグを見つける。

**手順**

1. 予約の状態（通常 / キャンセル済み）× 操作（編集・キャンセル・復活・宿泊税チェック）の表を作り、「同じ操作を2回」「キャンセル済みに編集」「存在しない ID に操作」を Emulator 版テストで一通り試す。
2. `ReservationModal` / `useUpdateReservation` の hooks テストで、debounce 中の close、保存失敗後の再編集、レスポンスの到着順の逆転を再現する。
3. 同時編集は Step 7 の #13 の決定に従う。

**完了条件**: 表のすべての組み合わせを試した / 見つかったものが §5 に載っている。

---

## 共通の締め（バグを1つ直すたびに）

1. **最小の再現ケースを回帰テストにした**（置き場所は `BugHunting.md` §4 の表）。修正前に落ち、修正後に通ることを確認した。
2. **横展開した。** 原因のパターンを1文で書き、全 Route・全 Infra・全 UseCase を grep した。既知のパターン:
   - 入口の Zod に refine がない（日付の前後、実在日、範囲、許容値、長さ）
   - `request.json()` を catch していない
   - 実行環境のローカル時刻に依存している（`new Date(y, m, d)`、`getMonth()`、`toISOString()`、`new Date('YYYY-MM-DD')`）
   - 外部エラーを「その他はすべて障害」に分類している
   - 新しいパターンを見つけたら `BugHunting.md` §3.2 に追記する。
3. **境界（env・認証・DB・SSR・CSP）に触れたら実機で確かめた**（`run` スキル、Emulator）。
4. `make check` が通る。`make`（開発サーバー）は止めてから実行する。起動したままだと E2E がそのサーバー（実際の Emulator のデータ）を再利用し（`playwright.config.ts` の `reuseExistingServer`）、無関係なテストが落ちる。
5. `BugHunting.md` §5 と本書の「進捗」を更新した。関連 doc（`ErrorHandling.md`・`Test.md`・`CICD.md`・`Schema/*`）も実装と一致している。
6. コミット1単位として変更内容とコミットメッセージ案を人間に示し、確認を待つ（AI はコミットしない）。
