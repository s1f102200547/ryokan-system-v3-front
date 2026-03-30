# Reservation スキーマ

## 概要
Gmail から取り込んだ予約データの構造定義。Firestore の `reservations` コレクションに格納される。

## フィールド定義

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| reservation_number | string | 1文字以上 | 予約番号 |
| booking_site | string (enum) | `"Chillnn"` \| `"Booking.com"` \| `"Expedia"` \| `"Other"` | 予約経路（OTA） |
| guest_name | string | 1文字以上 | ゲスト名 |
| check_in_date | string | `YYYY/MM/DD` 形式 | チェックイン日 |
| check_out_date | string | `YYYY/MM/DD` 形式 | チェックアウト日 |
| room_type | string | 1文字以上 | 部屋タイプ |
| stay_plan | string | 1文字以上 | 宿泊プラン |
| room_count | integer | 1〜9 | 部屋数 |
| adult_count | integer | 1〜9 | 大人数 |
| child_count | integer | 0〜9 | 子供数 |
| total_price | integer | 0以上 | 合計金額（円） |
| remarks | string | 空文字可 | 備考 |
| payment | string | 空文字可 | 支払い情報 |
| source | string (literal) | `"gmail"` 固定 | データソース |
| mail_id | string | 1文字以上 | 取り込み元のGmail メッセージID |

## バリデーションルール

- `check_out_date > check_in_date`
- strict モード: 定義外のフィールドはエラー