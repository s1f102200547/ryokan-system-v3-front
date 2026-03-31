# CleaningBoard スキーマ定義（DB非保存）

清掃ボード内でのみ使用する計算済みフィールドの定義。Firestore には保存しない。

DBフィールドの定義は @Schema.md を参照。

---

## 計算フィールド（`reservations` から導出）

| フィールド | 算出方法 | CleaningBoardでの用途 |
|---|---|---|
| nights | `check_out_date - check_in_date` の日数 | 連泊判定（未来予約で2泊以上なら「連」） |

---

## CleaningBoardRow（部屋ごとの行データ）

テーブル1行分を表す。DB非保存の集計値（userNotes を除く）。

| フィールド | 型 | 説明 |
|---|---|---|
| room | string | 部屋番号（`"21"` \| `"22"` \| `"31"` \| `"32"` \| `"42"` \| `"43"` \| `"61"`） |
| stayingReservation | Reservation \| null | 指定日に滞在中の予約（CI済み・CO前） |
| checkInReservation | Reservation \| null | 指定日以降に最も近いCI予約 |
| isToday | boolean | checkInReservation が当日CIかどうか |
| isConsecutive | boolean | 連泊フラグ（ロジックは CleaningBoardDomain.md 参照） |
| autoNotes | string | 自動生成備考テキスト（DB非保存） |
| userNotes | string | スタッフが印刷前に入力する備考（Firestore 保存） |

---
