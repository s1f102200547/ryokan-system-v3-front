# Domain（業務・画面・データ）

業務の言葉、画面と API、Firestore のデータ構造、計算のルール。コードの場所は `src/` からの相対パス。

## 用語

| 用語 | 意味 |
|---|---|
| C/I・C/O | チェックイン日・チェックアウト日。泊数 = `dateDiff(C/I, C/O)`（1以上、最大 `MAX_NIGHTS` = 30） |
| 泊目・泊インデックス | 対象日の泊インデックス = `dateDiff(C/I, 対象日)`（C/I 当日 = 0）。泊別配列の何番目を見るか |
| 泊別配列 | 1泊ごとの値の配列。`dinner_time` `dinner_info` `breakfast_time` `open_air_bath_time` `timetable_info`。i 番目は「i 泊目の夜とその翌朝」 |
| 部屋 | `"21" "22" "31" "32" "42" "43" "61"`（`constants/room.ts`）。`null` = 未割り当て。清掃ボードだけは予約のない `52 53 54` も行として出す |
| A税・宿泊税 | 大人1人1泊 200円（`A_TAX_RATE_PER_PERSON_PER_NIGHT`）。子供は対象外。予約サイトが Chillnn の予約は徴収不要 |
| 締めスタッフ | その C/I 日の宿泊税の金庫残高を確認したスタッフ名。`dailyInfo/{日付}.safeBalanceChecker` |
| 露天 | 貸切露天風呂の予約時刻。1泊に1つ、夕方（16:00〜22:00）か朝（7:30〜9:00）のどちらか |
| レイトアウト | `late_out = 1`。C/O が 11:00 |
| 連泊 | 2泊以上の滞在。清掃ボードでは「連泊(札置く)」= 部屋に札を置いて清掃を省く |
| mail_memo | 予約ごとの連絡履歴（メール要約・手動の操作履歴）。キャンセル・復活・手動追加のたびに1件追加される |

## 画面

| パス | 内容 |
|---|---|
| `/login` | メールアドレス・パスワード（PC 単位のアカウント） |
| `/daily-dashboard?date=YYYY-MM-DD` | 日付ナビ（今日 −100 日〜 +365 日）、その日の予約カード、予約の編集モーダル、手動追加、キャンセル、日次 todo、タイムテーブル印刷、清掃ボード印刷（今日・明日のみ） |
| `/a_tax_table` | 今月・先月の宿泊税の一覧。受領チェック、受領スタッフ名、締めスタッフ名、CSV（先月分） |
| `/time-restricted` | 本番の時間外（23:00〜6:00 JST）に表示 |
| `/` | `/daily-dashboard` へリダイレクト |

開発時だけ `?today=YYYY-MM-DD` で「今日」を差し替えられる（`app/daily-dashboard/page.tsx`。E2E が使う）。

### 予約カードと編集モーダル（`components/guestInfo/`）

- カードは「対象日 C/I の有効な予約」と「滞在中（C/I < 対象日 < C/O）の予約」。滞在中のカードは灰色・クリック不可。キャンセル済みは下に別表示
- カードは日付を切り替えるたび、編集モーダルを閉じるたび、手動追加・キャンセルのたびに取り直す（キャッシュしない）。日付を切り替えたら前の日のカードは出さず、届くまでカード欄の高さだけを取っておき、届いたカードはフェードインさせる。待ちが 0.5 秒を超えたときだけスピナーを出す（短い待ちでスピナーが少し回って消えるのを避ける。`components/DelayedSpinner.tsx`）。同じ日の取り直し中は前のカードを薄く出し、カードを開く・キャンセル・追加はできない（古いデータから編集させない）。取り直しに失敗したらエラーを出し、前のカードは残さない（`hooks/guestInfo/useGuestInfo.ts`）
- 日付の切り替えは `window.history.pushState` で `?date=` だけを変える（サーバーへの往復なし）。日付は押した時点の URL から計算するので、素早く2回押せば2日進む（`hooks/date/useDateNavigation.ts`）
- 上部のトグル（到着・露天・夕食・朝食）で、各カードに対象日の泊の値を表示
- 同じ部屋・同じ夜に有効な予約が2件以上あれば警告（`domain/room/roomConflicts.ts`）。タイムテーブルと清掃ボードは1部屋1件しか出せないため。保存は止めない（予約の大半は `gmail-listener` が書くので、このアプリだけでは防げない）
- 編集モーダルは **自動保存**。入力ごとに変更を貯め、500ms の debounce か blur で `PATCH /api/reservations/{id}` に送る。保存は直列。通信エラー・5xx の変更は貯め直して次の機会に再送し、閉じるときにも送る。4xx は送り直しても通らないので捨てる。閉じるとき、送り直しても失敗した変更か、4xx で断られてまだ保存できていないフィールドが残っていれば、閉じる前に確認する（`ReservationModal.tsx`）
- C/O 日・大人の人数を変えると、泊別配列・`age_groups` を伸縮して一緒に送る。モーダルを開いている間は一番長かったときの値を覚えていて、縮めてから伸ばし直すと戻る（`domain/reservation/nightArrays.ts`）
- タブ「C/I前」= 名前・部屋・人数・C/O・到着・露天・夕食・朝食・レイトアウト・タイムテーブルメモ・mail_memo。「C/I後」= 宿泊税受領・C/I 担当・国・市・目的・同行者・年代など（統計用）
- 復活（キャンセルの取り消し）の API と hook はあるが、画面からは呼んでいない（`showRestoreAction={false}`）
- `dinner_info` は入力欄が無効化されていて使っていない

## API（`app/api/`）

すべてログイン必須（`/api/auth/login` を除く）。日付は `lib/api/dateSchema.ts` の `DateSchema`（実在する日付、今日 JST の −100〜+365 日）。

| メソッド・パス | 内容 | 主な実装 |
|---|---|---|
| `POST /api/auth/login` | `{ email, password }`（メールアドレスの形式で3〜254文字、パスワードは3〜256文字。外れれば 400）をサーバーが Firebase Auth の REST で確かめ、Session Cookie を発行（期限は当日 23:00 JST、最短5分）。違えば 401 `invalid_credentials`、失敗が続いたメールアドレス・IP は 429 `too_many_attempts`（`retryAfterSeconds` と `Retry-After`）。同じアカウントの前のセッションは、次の API から 401（1アカウント1セッション。Firebase のユーザーのカスタムクレーム `sessionAuthTime` を使う）。本番の時間外は 403 `outside_business_hours`。Windows の Chrome・Edge 以外は 403 `client_not_allowed` | route 内 |
| `GET /api/guest-info?date=` | 対象日の `normal` / `staying` / `cancelled` / `roomConflicts` | `getGuestInfoUseCase` |
| `GET /api/timetable?date=` | タイムテーブル印刷用 | `getTimetableUseCase` |
| `GET /api/cleaning-board?date=` | 清掃ボード印刷用 | `getCleaningBoardUseCase` |
| `GET /api/a-tax-table?year=&month=` | 月の宿泊税一覧。JST の今月と先月だけ（それ以外は 400）。行は表に出す項目だけ（メールメモ・メモ・国などは返さない） | `getATaxTableUseCase` |
| `POST /api/reservations` | 手動追加 → 201 `{ reservation_number }` | `addReservationCommand` |
| `PATCH /api/reservations/{id}` | 部分更新。整合しなければ 400 `{ violations }`、なければ 404 | `updateReservationCommand` |
| `PATCH /api/reservations/{id}/cancel` | キャンセル。すでにキャンセル済みなら 409 | `cancelReservationCommand` |
| `PATCH /api/reservations/{id}/restore` | 復活。キャンセルされていなければ 409 | `restoreReservationCommand` |
| `PATCH /api/reservations/{id}/a-tax` | `a_tax_received` / `a_tax_received_by_staff_name` | infra 直接 |
| `GET/PATCH /api/daily/{date}/todos` | 日次 todo（最大50件、各100文字） | infra 直接 |
| `GET/PATCH /api/daily/{date}/safe-balance-checker` | 締めスタッフ名 | infra 直接 |

`{id}` は Firestore のドキュメント ID（`lib/api/documentIdSchema.ts`）。メール取り込みの予約では `reservation_number` と同じ、手動追加の予約では自動 ID で別物。

## Firestore

アクセスはサーバーの Admin SDK だけ（`infra/`）。ブラウザからは Rules で全拒否。

### `guestInfoV2/{docId}` — 予約

**予約の作成元は2つ。**
- `gmail-listener`（別リポジトリ）: 予約サイトのメールから作成・更新する。ドキュメント ID = `reservation_number`。`set(..., { merge: true })` で上書きし、キャンセルメールでは `cancel: 1` にする。このアプリが読まないフィールド（`reservation_status`, `room_type`, `stay_plan`, `room_count`, `total_price`, `remarks`, `payment`, `mail_id`, `source: 'gmail'`, `updated_at` など）も書く
- このアプリの手動追加: 自動 ID、`reservation_number` は UUID v7、`source: 'manual'`

読み取り時の正規化（`infra/reservation/firestoreReservationRepository.ts` の `toReservation`）:

| フィールド | Firestore | アプリ（`types/reservation.ts`） | 不正・欠損のとき |
|---|---|---|---|
| `check_in_date`, `check_out_date` | `YYYY/MM/DD` | `YYYY-MM-DD` | 形式違い・泊数 < 1・泊数 > 30 → **破損として読み飛ばす** |
| `adult_count`, `child_count` | 0〜9 の整数（子供だけの宿泊があるので大人 0 も正しい） | number | 破損 |
| `room` | 部屋番号 / `""` / `null` | `RoomNumber \| null` | `""` は `null`。それ以外の値は破損 |
| `cancel`, `late_out` | 数値 | `0 \| 1` | 1 以外は 0 |
| `guest_name` | 文字列 | string | `""` |
| `arrival_time` | `"06:00"`〜`"22:00"`（1時間刻み） | `string \| null` | `null` |
| `dinner_time[]` | `NONE` `CANCEL` `PENDING` `17:30`〜`20:00`（30分刻み） | `string[]` | 要素 → `NONE` |
| `breakfast_time[]` | `7:30a`〜`9:30b`（a/b はタイムテーブルの上段・下段）/ `null` | `(string\|null)[]` | 要素 → `null` |
| `open_air_bath_time[]` | 夕 `16:00`〜`22:00`、朝 `7:30`〜`9:00` / `null`（以前の `9:30` は `null` として読む） | `(string\|null)[]` | 要素 → `null` |
| `dinner_info[]`, `timetable_info[]` | 文字列 | `string[]` | 要素 → `""` |
| `age_groups[]` | 年代の文字列 / `null`（長さ = 大人の人数） | `(string\|null)[]` | 長さ違いは全部 `null` |
| `booking_site` | `chillnn` `booking.com` `expedia`（大文字小文字は無視） | `BookingSite` | `other` |
| `mail_memo[]` | `{ month, day, name, summary, text, source }`（月日は `"1"`〜`"12"` / `"1"`〜`"31"`、0埋めなし）。このアプリが足す履歴は `name` = 操作したスタッフ、`summary` = `手動で新規追加` / `手動キャンセル` / `手動キャンセル復活`、`text` = 理由、`source` = `システム`。メールの要約は `source` = `booking` / `expedia` / `webmail` | `MailMemoEntry[]` | 形の合わない要素は除外 |
| `a_tax_received` | boolean | boolean | `false` |
| その他の文字列（`reservation_number`, `a_tax_received_by_staff_name`, `check_in_staff_name`, `city`, `profession`, `other_note`） | 文字列 | string | `""` |
| `country`, `group_type`, `purpose`, `tourism_type` | 文字列 | `string \| null` | `""` も `null` |

- **泊別配列は、配列でないか長さが泊数と違えば、全泊分を初期値で作り直す**（要素ごとの補完ではない）。そのため書き込み側で長さを必ず揃える
- 破損した予約は一覧から除き、ID と理由を WARN ログに出す（`lib/skippedReservationReporter.ts`）。Slack には通知しない。画面からは空室に見えるので、人が DB を直す必要がある
- 取得はすべて `check_in_date` の範囲検索。guest-info は対象日の −30 日〜対象日、timetable・清掃ボードは ±30 日、宿泊税は月。**31泊以上の滞在はこの窓に入らない** ので `MAX_NIGHTS = 30` で書き込みも拒否している

書き込みの検証:
1. Route の Zod（`lib/api/reservationSchemas.ts`）: 値の許容範囲は読み取りと同じ定数。文字数・件数の上限は `RESERVATION_LIMITS`（本番データの最大の約2〜5倍）
2. `PATCH` は Command がトランザクション内で DB の今の C/I・C/O・大人の人数を読み、`domain/reservation/validateReservationPatch.ts` で検査してから書く: C/O > C/I、泊数 ≤ 30、泊数が変わるなら泊別配列5つをすべて送る、送った配列の長さ = 更新後の泊数、大人の人数が変わるなら `age_groups` も送る、`age_groups` の長さ = 大人の人数。DB の C/O が壊れている（C/I 以前の）予約も、正しい C/O と泊別配列をそろえて送れば直せる（読み飛ばされた予約の修正手段）
3. キャンセル・復活もトランザクション。状態が同じなら何も書かず 409（履歴と通知を増やさない）。`mail_memo` の末尾に1件足す（`arrayUnion` は同じ内容を足さないので使わない）

更新はフィールド単位の `update`。2台の PC が同じ予約の同じフィールドを編集すると後勝ち。`gmail-listener` の merge set も同じ予約を上書きしうる。

### `dailyInfo/{YYYY-MM-DD}` — 日次データ

| フィールド | 型 | 備考 |
|---|---|---|
| `date` | `YYYY-MM-DD` | ID と同じ |
| `todos` | `{ id, text }[]` | 最大50件、`text` は1〜100文字。読み取りで形が違えば `FIRESTORE_DATA_CORRUPTION`（500） |
| `safeBalanceChecker` | string | 締めスタッフ名。文字列でなければ `""` |
| `updated_at` | ISO 文字列 | 書き込みのたびに更新（UTC） |
| `CleaningBoardUserNotes`, `migrated_at`, `source.collection` / `source.path` / `source.field` | — | 旧システムからの移行で残ったもの。今のコードは読み書きしない |

ドキュメントがなければ空として扱い、更新は `set(..., { merge: true })` で作る。

### `loginThrottle/{SHA-256}` — ログインの失敗回数

このアプリだけが使う（`gmail-listener` は使わない）。ID は `sha256("email:" + 小文字のメールアドレス)` か `sha256("ip:" + IP)`。生のメールアドレス・IP は置かない。判定は `domain/auth/loginThrottle.ts`、読み書きは `infra/auth/firestoreLoginThrottleRepository.ts`。

| フィールド | 型 | 備考 |
|---|---|---|
| `failures` | number | 続けて失敗した回数。成功でドキュメントごと消す |
| `lastFailureAt` | Timestamp | ここから24時間たつと、次の失敗は1から数える |
| `lockedUntil` | Timestamp | この時刻までパスワードを確かめず 429 |
| `expireAt` | Timestamp | TTL 用（最後の失敗 + 25時間）。Firestore の TTL ポリシーをこのフィールドに設定する |

確かめる前に、止まっていないかの確認と失敗の記録を1つのトランザクションで行う（`acquire`。先に数えるので、同時の試行でもすり抜けない）。成功で消し（`reset`）、Firebase の障害なら先に数える前の状態に戻す（`refund`）。

形が違うドキュメントは、なかったものとして扱う（止めない側に倒し、次の失敗で書き直す）。

`cancel` `late_out` は 0/1 の数値、`a_tax_received` は boolean で、型がそろっていない。`gmail-listener` と過去のデータとの互換のため、そのままにしている。

## 計算のルール

### 部屋の状態（`domain/room/roomState.ts` の `computeRoomCheckInState`）

対象日・部屋ごとに、キャンセルされていない予約から計算する。タイムテーブルと清掃ボードの基礎。

- 滞在中 `stayingReservation`: C/I < 対象日 < C/O
- 連泊継続 `isStayingContinued`: 滞在中かつ C/O > 翌日
- 次の C/I `checkInReservation`: 連泊継続でなければ、C/I ≥ 対象日のうち最も近い予約
- `isTodayCheckIn` / `isFutureCheckIn`: 次の C/I が対象日 / 対象日より後
- `isTodayCheckout` / `isLateCheckout`: C/O = 対象日 / かつ `late_out = 1`
- `isTodayVacant`: 滞在中も当日 C/I もない。`isPreviousDayVacant`: 前夜に泊まっている予約がない
- 部屋の重複（`roomConflicts.ts`）は「C/I ≤ 対象日 < C/O」の有効な予約が同じ部屋に2件以上。当日 C/O と当日 C/I の入れ替わりは重複ではない

### タイムテーブル（`application/timetable/getTimetableUseCase.ts`）

対象日の夜に泊まる予約（滞在中 + 当日 C/I）の、対象日の泊インデックスの値を部屋ごとに並べる。

- 到着: 当日 C/I の `arrival_time`。14:00 より前は「13:00以前」、19:00 以降は「19:00以降」にまとめ、時刻を添える
- 夕食: `NONE` `CANCEL` は出さない、`PENDING` は「未定」
- 露天: 同じ値を夕方の列と朝の列（`constants/timetable.ts`）に振り分ける
- 朝食: 翌朝の分（印刷では翌日の日付を付ける）
- C/O・レイトアウト: 翌日の状態から
- 部屋ごとの欄: 名前、人数、`n/全泊数泊目`、`timetable_info`。空室は「空室」
- 連泊の一覧: 2泊以上の滞在を `{部屋マーク}-{大人}({子供})({n}/{全泊数}泊目)` で
- 上部のチェック項目: 曜日ごとの固定項目（日曜は資源ごみ、月曜はリネン発注）と、その日の todo

### 清掃ボード（`application/cleaningBoard/getCleaningBoardUseCase.ts`）

印刷する日の部屋ごとに、次の C/I の人数（先の日付なら括弧付き）、滞在中の人数、「連泊(札置く)」を出す。自動の備考: レイトアウト、前日空室ならセットアップ済み、当日空室なら翌日以降の予約でセットアップ。画面では今日を選ぶと明日の分を印刷する。

### 宿泊税（`application/aTaxTable/getATaxTableUseCase.ts`、`components/aTaxTable/`）

- 対象月に C/I する、キャンセルされていない予約。税額 = 大人 × 泊数 × 200 円（保存せず毎回計算）。C/I 月にまとめて計上する
- Chillnn は受領チェック・受領スタッフ名を出さない（`domain/reservation/bookingSitePolicy.ts`）
- C/I 日ごとの最後の行に、締めスタッフ名と「大人×泊」の合計（Chillnn か受領済みの予約だけを数える）を出す（`computeProcessedRows`）
- 受領チェックは画面を先に変えてから保存する。失敗するとエラーを出すが、チェックは戻らない

## 決めた仕様（意図した挙動。バグとして直さない）

| 項目 | 挙動 | 理由 |
|---|---|---|
| キャンセル済みの予約 | 編集も宿泊税のチェックもできる（200）。宿泊税の一覧には出ない | キャンセル理由のメモや、復活前の修正に使う |
| `mail_memo` | 画面から追加・編集・削除（確認あり）でき、システムが足した履歴も消せる | 削除ボタンと確認は意図したもの |
| 同時編集 | 後勝ち。楽観ロックはない | 7部屋・少人数で、同じ予約を同時に開くことはまれ。問題になったら、読んだときの更新時刻を保存時に送り、その後に書かれていれば 409 にする |
| 部屋未割り当ての予約 | ダッシュボードには出るが、タイムテーブル（到着・夕食・朝食）と清掃ボードには出ない | 当日までに部屋を割り当てる運用。割り当て忘れると厨房の人数から漏れる |
| 時間帯制限 | 本番はログイン API だけが時間外に 403。ほかの API は時間で制限しない | Session Cookie が 23:00 に切れる |
| 書き込みの日付の範囲 | 実在日かつ今日 −100〜+365 日 | 画面から範囲外を開けないので実害はなく、年の打ち間違いを止められる |
| Slack 通知 | 障害（`[ALERT]`）、手動の追加・キャンセル・復活の記録、ログインの成功（`[ログイン]`）、端末・ブラウザでの拒否（`[ログイン拒否]`）、失敗が続いて止め始めたこと（`[ログイン制限]`）だけ | 入力の誤り（4xx）、ログイン失敗、壊れたデータは通知しない（通知が多いと本物の障害が埋もれる） |

## 既知の問題（未対応）

- Slack 通知の送信に失敗しても Cloud Logging に ERROR が出るだけで、誰も気付けない
- 本番の `guestInfoV2` に 486 泊（2025-04-01 → 2026-07-31、手動追加）の予約が1件あり、泊数の上限で読み飛ばされて毎回 WARN ログに出る。直すか消すかは人が決める（2026-10-31 時点）
- 予約の手動追加ダイアログ（`components/guestInfo/AddReservationDialog.tsx`）の `Select` に `labelId` がなく、スクリーンリーダーやテストの `getByLabel` で項目名が取れない
- 清掃ボードの縦書きの列見出しが、実際の用紙で切れずに印刷されるかは未確認
