
## `reservations` コレクション

Gmail から取り込んだ予約データ。

**クエリキー例:**
```ts
check_in_date == "YYYY/MM/DD"
```

### 基本フィールド定義

| フィールド | 型 | 必須/任意 | 制約 | 説明 |
|---|---|---|---|---|
| id | string | 必須 | ドキュメントID | 予約ドキュメントの識別子 |
| reservation_number | string | 必須 | 1文字以上 | 予約番号 |
| guest_name | string | 必須 | 1文字以上 | ゲスト名 |
| check_in_date | string | 必須 | `YYYY/MM/DD` 形式 | チェックイン日 |
| check_out_date | string | 必須 | `YYYY/MM/DD` 形式 | チェックアウト日 |
| adult_count | integer | 必須 | 0〜9 | 大人数（子供のみ宿泊の場合もあるので 0 も有効とする） |
| child_count | integer | 必須 | 0〜9 | 子供数 |
| booking_site | string (enum) | 任意 | `"chillnn"` \| `"booking.com"` \| `"expedia"` \| `"other"` | 予約経路（OTA）。infra 層で小文字に正規化 |
| room | string \| null | 任意 | `"21"` \| `"22"` \| `"31"` \| `"32"` \| `"42"` \| `"43"` \| `"61"` \| `""` \| `null` | 部屋番号 |
| room_type | string | 任意 | 1文字以上 | 部屋タイプ |
| stay_plan | string | 任意 | 1文字以上 | 宿泊プラン |
| room_count | integer | 任意 | 1〜9 | 部屋数 |
| total_price | integer | 任意 | 0以上 | 合計金額（円） |
| remarks | string | 任意 | 空文字可 | 備考 |
| payment | string | 任意 | 空文字可 | 支払い情報 |
| late_out | integer | 任意 | `0` \| `1` | レイトアウト有無（1 = あり） |
| cancel | integer | 任意 | `0` \| `1` | キャンセルフラグ（1 = キャンセル済み） |
| source | string (literal) | 任意 | `"gmail"` 固定 | データソース |
| mail_id | string | 任意 | 1文字以上 | 取り込み元の Gmail メッセージID |

### バリデーションルール

- `check_out_date > check_in_date`
- `cancel == 1` のレコードは除外する
- strict モード: 定義外のフィールドはエラー

---

## UI操作で追加・編集される フィールド

| フィールド | 型 | 許容値 | 欠損時 |
|---|---|---|---|
| `arrival_time` | string\|null | `06:00`〜`22:00`（0埋め必須） | null |
| `dinner_time` | string[] | `NONE`/`CANCEL`/`PENDING`/`HH:MM` | 要素 `'NONE'` |
| `breakfast_time` | (string\|null)[] | `HH:MMa`/`HH:MMb`/null | 要素 `null` |
| `open_air_bath_time` | (string\|null)[] | 夕方16:00〜22:00 / 朝7:30〜9:30 | 要素 `null` |
| `timetable_info` | string[] | 任意文字列 | 要素 `''` |
| `dinner_info` | string[] | 各夜の夕食備考 | 要素 `''` |

配列長は `dateDiff(check_in_date, check_out_date)` と一致すること。不一致は fallback 値で全補完。

---

## 手動追加・操作履歴フィールド

UI 操作（手動追加・C/I 後タブ編集）で書き込まれるフィールド。

| フィールド | 型 | 欠損時 | 説明 |
|---|---|---|---|
| `mail_memo` | `MailMemoEntry[]` | `[]` | 操作履歴ログ（キャンセル/復活/手動追加） |
| `a_tax_received` | boolean | `false` | 宿泊税受領済みフラグ |
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
