# DB スキーマ定義

Firestore に保存される全コレクションのフィールド定義を集約する。

---

## 1. `reservations` コレクション

Gmail から取り込んだ予約データ。

**クエリキー例:**
```ts
check_in_date == "YYYY/MM/DD"
```

### フィールド定義

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| id | string | ドキュメントID | 予約ドキュメントの識別子 |
| reservation_number | string | 1文字以上 | 予約番号 |
| booking_site | string (enum) | `"Chillnn"` \| `"Booking.com"` \| `"Expedia"` \| `"Other"` | 予約経路（OTA） |
| guest_name | string | 1文字以上 | ゲスト名 |
| check_in_date | string | `YYYY/MM/DD` 形式 | チェックイン日 |
| check_out_date | string | `YYYY/MM/DD` 形式 | チェックアウト日 |
| room | string | `"21"` \| `"22"` \| `"31"` \| `"32"` \| `"42"` \| `"43"` \| `"61"` | 部屋番号 |
| room_type | string | 1文字以上 | 部屋タイプ |
| stay_plan | string | 1文字以上 | 宿泊プラン |
| room_count | integer | 1〜9 | 部屋数 |
| adult_count | integer | 1〜9 | 大人数 |
| child_count | integer | 0〜9 | 子供数 |
| total_price | integer | 0以上 | 合計金額（円） |
| remarks | string | 空文字可 | 備考 |
| payment | string | 空文字可 | 支払い情報 |
| late_out | boolean | - | レイトアウト有無 |
| cancel | integer | `0` \| `1` | キャンセルフラグ（1 = キャンセル済み） |
| source | string (literal) | `"gmail"` 固定 | データソース |
| mail_id | string | 1文字以上 | 取り込み元の Gmail メッセージID |

### バリデーションルール

- 必須フィールド: `id`, `reservation_number`, `guest_name`, `check_in_date`, `check_out_date`, `adult_count`, `child_count`
- それ以外のフィールドは省略可（optional）
- `check_out_date > check_in_date`
- `cancel == 1` のレコードはアプリケーション層で除外する
- strict モード: 定義外のフィールドはエラー

---

## 2. `daily` コレクション

日次データ。ドキュメントIDは対象日（`YYYY-MM-DD`）。

### フィールド定義

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| cleaningBoardNotes | map\<room, string\> | 省略可 | 清掃ボードの部屋ごとのユーザー入力備考。キーは部屋番号（例: `"21"`）、値は備考テキスト |

- `daily/{date}/cleaningBoardNotes` の形で部屋番号をキーにした map として格納する
- キーが存在しない部屋は `userNotes = ""` として扱う

---
