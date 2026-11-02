
# Reservations Schema

## `guestInfoV2` コレクション

Gmail 取り込み、手動追加、UI 編集で作成・更新される予約データ。Firestore 上の日付は `YYYY/MM/DD`、アプリ内部/API 入出力では `YYYY-MM-DD` に正規化する。

**クエリキー例:**
```ts
collection("guestInfoV2")
check_in_date == "YYYY/MM/DD"
```

### 基本フィールド定義

| フィールド | 型 | 必須/任意 | 制約 | 説明 |
|---|---|---|---|---|
| id | string | 必須 | ドキュメントID | 予約ドキュメントの識別子 |
| reservation_number | string | 任意 | 欠損時は `''` に正規化 | 予約番号。手動追加時は UUID v7 |
| guest_name | string | 任意 | 最大100文字。欠損/不正時は `''` に正規化 | ゲスト名 |
| check_in_date | string | 必須 | `YYYY/MM/DD` 形式 | チェックイン日 |
| check_out_date | string | 必須 | `YYYY/MM/DD` 形式 | チェックアウト日 |
| adult_count | integer | 必須 | 0〜9 | 大人数（子供のみ宿泊の場合もあるので 0 も有効とする） |
| child_count | integer | 必須 | 0〜9 | 子供数 |
| booking_site | string | 任意 | `"chillnn"` \| `"booking.com"` \| `"expedia"` は小文字に正規化。それ以外/欠損は `"other"` | 予約経路（OTA） |
| room | string \| null | 任意 | `"21"` \| `"22"` \| `"31"` \| `"32"` \| `"42"` \| `"43"` \| `"61"` \| `""` \| `null`。`""` は `null` に正規化 | 部屋番号 |
| room_type | string | 任意 | 1文字以上 | 部屋タイプ |
| stay_plan | string | 任意 | 1文字以上 | 宿泊プラン |
| room_count | integer | 任意 | 1〜9 | 部屋数 |
| total_price | integer | 任意 | 0以上 | 合計金額（円） |
| remarks | string | 任意 | 空文字可 | 備考 |
| payment | string | 任意 | 空文字可 | 支払い情報 |
| late_out | integer | 任意 | `1` のみ true 扱い。それ以外/欠損は `0` | レイトアウト有無（1 = あり） |
| cancel | integer | 任意 | `1` のみ true 扱い。それ以外/欠損は `0` | キャンセルフラグ（1 = キャンセル済み）。すでにキャンセル済みの予約のキャンセル、キャンセルしていない予約の復活は 409（履歴も通知も増やさない）。キャンセル済みの予約も編集・宿泊税チェックはできる（仕様。2026-10-31 確認） |
| source | string | 任意 | `"gmail"` \| `"manual"` など | データソース |
| mail_id | string | 任意 | 1文字以上 | 取り込み元の Gmail メッセージID |

### バリデーションルール

- `check_out_date > check_in_date`、泊数は 30 泊以下（`MAX_NIGHTS`。画面の取得窓が対象日の前後 30 日の C/I のため）。読み取りで泊数が 0 以下・31 以上のドキュメントは `FIRESTORE_DATA_CORRUPTION` として読み飛ばし、WARN ログに残す（Slack には通知しない）（1件のせいで範囲取得全体を失敗させない）。
- 同じ部屋・同じ夜に有効な予約が2件以上あってもよい（Gmail 取り込みが書くため止められない）。ゲスト情報 API は対象日の重複を `roomConflicts` で返し、ダッシュボードに警告を出す。清掃ボード・タイムテーブルは1部屋1件を前提にしているので、2件目は表示されない。
- `guestInfoV2` の Firestore 日付は `YYYY/MM/DD`。Infra 層で `YYYY-MM-DD` に変換して Application/Domain/UI へ渡す。
- `fetchByDateRange` と `fetchByMonth` は `cancel == 1` のレコードも読み取る。キャンセル除外は各 UseCase/UI の用途に応じて行う。
- 基本フィールドの破損は `FIRESTORE_DATA_CORRUPTION`。ただし一部の任意フィールドは fallback 値へ正規化する。
- 定義外フィールドは現行コードでは禁止していない。

---

## UI操作で追加・編集される フィールド

| フィールド | 型 | 許容値 | 欠損時 |
|---|---|---|---|
| `arrival_time` | string\|null | `06:00`〜`22:00`（0埋め必須） | `null` |
| `dinner_time` | string[] | `NONE`/`CANCEL`/`PENDING`/`17:30`〜`20:00` の30分刻み | 要素 `'NONE'` |
| `breakfast_time` | (string\|null)[] | `7:30a`/`8:00a`/`8:30a`/`9:00a`/`9:30a`/`7:30b`/`8:00b`/`8:30b`/`9:00b`/`9:30b`/null | 要素 `null` |
| `open_air_bath_time` | (string\|null)[] | 夕方16:00〜22:00 / 朝7:30〜9:30 | 要素 `null` |
| `timetable_info` | string[] | 任意文字列 | 要素 `''` |
| `dinner_info` | string[] | 各夜の夕食備考 | 要素 `''` |

配列長は `dateDiff(check_in_date, check_out_date)` と一致すること。不一致、配列でない値、要素不正は fallback 値で全補完または要素補完する。

### 書き込み時の検査（`PATCH /api/reservations/[id]`）

読み取りで fallback に置き換えられる値は、書き込みの入口で拒否する（保存は成功したのに読み戻すと消える、を防ぐ）。

- 許容値（上の表）は `src/constants/guestInfo.ts` の `*_VALUES` に1か所でまとめ、Route の Zod と Infra の読み取り検証が共通で参照する。許容値外は 400。
- 文字列の長さと配列の件数は `src/constants/guestInfo.ts` の `RESERVATION_LIMITS`（と `MAX_NIGHTS`、`MAX_ADULT_COUNT`）で上限を付け、超えたら 400（T7-4）。値は本番データの最大の約 2〜5 倍で、すべて上限でも1件は Firestore の 1 MiB に収まる。読み取り（Infra）には入れない。画面の入力欄にも同じ値を `maxLength` で付け、`mail_memo` は上限の件数に達すると追加ボタンを押せない。Zod 4 はコードポイント、`maxLength` は UTF-16 で数えるので、画面で入力できる値は必ず通る
- 日付（`check_out_date`、POST の `check_in_date` / `check_out_date`、cancel / restore の `target_date`）は、実在する日付かつ今日（JST）から `DATE_RANGE_PAST_DAYS` 日前〜`DATE_RANGE_FUTURE_DAYS` 日後。範囲外は 400。
- 既存の予約と合わせた検査は、読み取り・検査・書き込みを1つのトランザクションで行う（`src/domain/reservation/validateReservationPatch.ts`）。違反は 400（`violations` に理由のコード）、予約が存在しなければ 404。
  - 更新後の C/O は C/I より後（泊数 1 以上）で、30 泊以下。
  - 泊数が変わるなら、泊別配列5つをすべて送る。送った配列の長さは更新後の泊数。
  - 大人の人数が変わるなら `age_groups` も送る。長さは更新後の大人の人数。
  - DB の C/O が壊れている（C/I 以前の）予約も、正しい C/O と泊別配列を送る更新なら通す（修正手段）。

---

## 手動追加・操作履歴フィールド

UI 操作（手動追加・C/I 後タブ編集）で書き込まれるフィールド。

| フィールド | 型 | 欠損時 | 説明 |
|---|---|---|---|
| `mail_memo` | `MailMemoEntry[]` | `[]` | 操作履歴ログ（キャンセル/復活/手動追加）。画面から追加・編集・削除（確認あり）でき、システムの記録も消せる（仕様。2026-10-31 確認）。キャンセル・復活はトランザクションで末尾に1件追加する（同じ内容でも重ねて残す） |
| `a_tax_received` | boolean | `false` | 宿泊税受領済みフラグ。宿泊税は全泊分を C/I の月に計上する（月をまたぐ連泊も C/I の月。仕様。2026-10-31 確認） |
| `a_tax_received_by_staff_name` | string | `''` | 宿泊税受領スタッフ名 |
| `check_in_staff_name` | string | `''` | C/I 担当スタッフ名 |
| `country` | string\|null | `null` | ゲスト国名（旧データ `""` → 読み取り時 `null` に正規化） |
| `city` | string | `''` | ゲスト居住都市 |
| `age_groups` | (string\|null)[] | 要素 `null` | 大人ごとの年代。長さ = adult_count |
| `group_type` | string\|null | `null` | グループ構成（旧データ `""` → `null` に正規化） |
| `purpose` | string\|null | `null` | 旅行目的（旧データ `""` → `null` に正規化） |
| `tourism_type` | string\|null | `null` | 観光タイプ（旧データ `""` → `null` に正規化） |
| `profession` | string | `''` | 職業 |
| `other_note` | string | `''` | その他備考 |

### 手動追加時に保存される最小フィールド

`POST /api/reservations` による手動追加では、以下を `guestInfoV2` に追加する。

- `reservation_number`: UUID v7
- `check_in_date`, `check_out_date`: Firestore 形式 `YYYY/MM/DD`
- `room`, `adult_count`, `child_count`, `guest_name`, `booking_site`
- `cancel: 0`
- `source: 'manual'`
- `mail_memo`: 初期操作履歴

### MailMemoEntry 構造

```typescript
{
  month: string    // "1"〜"12"
  day: string      // "1"〜"31"
  name: string     // 操作者スタッフ名（手動追加）またはゲスト名（キャンセル/復活）
  summary: string  // 例: 'キャンセル' | 'キャンセル復活' | '手動で新規追加'
  text: string     // 理由テキスト
  source: string   // 例: 'システム' | 'booking' | 'expedia' | 'webmail'
}
```
