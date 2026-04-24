
## `reservations` コレクション

Gmail から取り込んだ予約データ。

**クエリキー例:**
```ts
check_in_date == "YYYY/MM/DD"
```

### フィールド定義

| フィールド | 型 | 必須/任意 | 制約 | 説明 |
|---|---|---|---|---|
| id | string | 必須 | ドキュメントID | 予約ドキュメントの識別子 |
| reservation_number | string | 必須 | 1文字以上 | 予約番号 |
| guest_name | string | 必須 | 1文字以上 | ゲスト名 |
| check_in_date | string | 必須 | `YYYY/MM/DD` 形式 | チェックイン日 |
| check_out_date | string | 必須 | `YYYY/MM/DD` 形式 | チェックアウト日 |
| adult_count | integer | 必須 | 1〜9 | 大人数 |
| child_count | integer | 必須 | 0〜9 | 子供数 |
| booking_site | string (enum) | 任意 | `"Chillnn"` \| `"Booking.com"` \| `"Expedia"` \| `"Other"` | 予約経路（OTA） |
| room | string \| null | 任意 | `"21"` \| `"22"` \| `"31"` \| `"32"` \| `"42"` \| `"43"` \| `"61"` \| `""` \| `null` | 部屋番号 |
| room_type | string | 任意 | 1文字以上 | 部屋タイプ |
| stay_plan | string | 任意 | 1文字以上 | 宿泊プラン |
| room_count | integer | 任意 | 1〜9 | 部屋数 |
| total_price | integer | 任意 | 0以上 | 合計金額（円） |
| remarks | string | 任意 | 空文字可 | 備考 |
| payment | string | 任意 | 空文字可 | 支払い情報 |
| late_out | boolean | 任意 | - | レイトアウト有無 |
| cancel | integer | 任意 | `0` \| `1` | キャンセルフラグ（1 = キャンセル済み） |
| source | string (literal) | 任意 | `"gmail"` 固定 | データソース |
| mail_id | string | 任意 | 1文字以上 | 取り込み元の Gmail メッセージID |

### バリデーションルール

- `check_out_date > check_in_date`
- `cancel == 1` のレコードは除外する
- strict モード: 定義外のフィールドはエラー

---