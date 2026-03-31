# CleaningBoard スキーマ定義（DB非保存）

清掃ボード内でのみ使用する計算済みフィールドの定義。Firestore には保存しない。

DBフィールドの定義は @Schema.md を参照。

---

## 計算フィールド（`reservations` から導出）

| フィールド | 算出方法 |
|---|---|
| nights | `check_out_date - check_in_date` の日数 |

---

## CleaningBoardRow（部屋ごとの行データ）

テーブル1行分を表す。DB非保存の集計値（userNotes のみ DB保存、DBフィールド名は `CleaningBoardUserNotes`）。

| フィールド | 型 | 説明 |
|---|---|---|
| room | string | 部屋番号（`"21"` \| `"22"` \| `"31"` \| `"32"` \| `"42"` \| `"43"` \| `"61"`） |
| stayingReservation | Reservation \| null | 指定日に滞在中の予約（CI済み・CO前） |
| checkInReservation | Reservation \| null | 指定日以降に最も近いCI予約 |
| isToday | boolean | checkInReservation が指定日にCIかどうか |
| isConsecutive | boolean | 連泊フラグ（ロジックは CleaningBoardDomain.md 参照） |
| autoNotes | string | 自動生成備考テキスト（DB非保存） |
| userNotes | string | スタッフが印刷前に入力する備考テキスト（DBフィールド名: `CleaningBoardUserNotes`・テーブル全体で1つ） |

---
