# CleaningBoard ドメインロジック定義

清掃ボード（V3）のビジネスロジックを定義する。スキーマは @Schema.md / @CleaningBoardSchema.md を参照。

---

## 概要

掃除スタッフが午前中に各部屋のセットアップを行うための情報表。  
部屋の状態（滞在中 / チェックアウト済み / 空室）と次の予約情報を1テーブルに集約し、A4横向きで印刷して使用する。

---

## 定数

```ts
const ROOM_NUMBERS = ["21", "22", "31", "32", "42", "43", "61"] as const;
type RoomNumber = typeof ROOM_NUMBERS[number];

// 処理対象範囲（指定日を起点に前後30日分）
const QUERY_RANGE_DAYS = 30;
```

---

## 処理対象の予約

- `reservations` コレクションから指定日の前後 30 日分を取得する
- `cancel === 1` の予約は**全処理から除外する**

---

## 部屋の状態分類

指定日（`targetDate`）の朝時点における各部屋の状態を以下の3つに分類する。

| 状態 | 判定条件 | スタッフ作業 |
|---|---|---|
| **チェックアウト済み** | `check_in_date < targetDate` かつ `check_out_date === targetDate` | 次ゲスト情報をもとにセットアップ（布団・アメニティ配置） |
| **滞在中** | `check_in_date <= targetDate` かつ `check_out_date > targetDate` | アメニティ補充のみ |
| **空室** | targetDate に該当予約なし | 原則作業不要（セットアップ済みのため） |

---

## 連泊フラグ（isConsecutive）の判定

過去/当日予約と指定日の新規CI予約でロジックが異なる。**簡略化しないこと。**

### パターン A: 過去・当日CI予約（`check_in_date <= targetDate`）

```
check_out_date > targetDate + 1  →  isConsecutive = true（「連」）
check_out_date === targetDate + 1 →  isConsecutive = false（最終夜）
```

「連泊」の意味: 翌日以降も継続して滞在する予定があること。

### パターン B: 未来CI予約（`check_in_date > targetDate`）

```
nights >= 2  →  isConsecutive = true（「連」）
nights === 1 →  isConsecutive = false
```

`nights = check_out_date - check_in_date`（日数）

---

## C/I 列の表示ロジック

各部屋行の「C/I」列に表示するゲスト人数。

| 条件 | 表示 |
|---|---|
| `check_in_date === targetDate` の予約あり（当日CI） | `{adult_count}({child_count})` |
| 当日CI予約なし・未来CI予約あり | `({adult_count}({child_count}))` ※括弧付き |
| CI予約なし | 空欄 |

- `checkInReservation` が当日CIなら `isToday = true`
- 子供が0人の場合は `({child_count})` 部分を省略してよい（実装判断）

---

## 備考欄（autoNotes）の自動生成ロジック

優先度順に評価する。複数条件が当てはまる場合は先に一致したものを採用する。

### 1. レイトアウト

```
条件: late_out === true  かつ  check_out_date === targetDate + 1
出力: "レイトアウト11:00"
```

滞在中の部屋で、翌日COかつレイトアウト設定がある場合に表示。

### 2. 前日空室

```
条件: targetDate - 1 にその部屋の有効予約（cancel !== 1）が存在しない
出力: "{room}号室: 前日空室のためセットアップ済み"
```

スタッフへの案内: 前日すでにセットアップ済みなので追加作業不要。

### 3. 当日空室

```
条件: targetDate にその部屋に滞在・CIするゲストがいない
出力: "{room}号室: 本日空室のため次回の予約情報をもとにセットアップ"
```

スタッフへの案内: 次回CI予約のゲスト情報を参照してセットアップする。

### 4. 何も当てはまらない場合

`autoNotes = ""`（空文字）

---

## ユーザー入力備考（userNotes）

- `autoNotes` の下にテキストボックスを設置し、スタッフが印刷前に追記できる
- `userNotes` は **Firestore の `daily` コレクションに保存する**（スキーマは @Schema.md 参照）
- パス: `daily/{targetDate}` ドキュメントの `cleaningBoardNotes` フィールド（map）に部屋番号をキーとして格納
- 日付を変えた際は対応する `daily/{targetDate}` ドキュメントを読み込む

---

## テーブル構造

- 7行固定（`ROOM_NUMBERS` 順）
- A4 横向き印刷を前提にスタイリングする
- 列構成（参考）: 部屋番号 / 滞在中ゲスト / C/I / 連泊 / 備考

---

## 日付切り替え（V3変更点）

- 日付は MUI DatePicker で選択し、アプリ全体のグローバル state（Context）で共有する
- 清掃ボード・予約状況など各ページが同じ `targetDate` を参照する
- V2 は「翌日固定」だったが V3 では任意の日付に変更可能

---

## データフロー概要

```
Firestore(reservations)
  └─ 指定日 ±30日分を取得
       └─ cancel=1 を除外
            └─ ROOM_NUMBERS でグループ化
                 └─ 各部屋ごとに CleaningBoardRow を生成
                      ├─ stayingReservation（滞在中）を特定
                      ├─ checkInReservation（次CI）を特定
                      ├─ isConsecutive を判定（パターンA/B）
                      ├─ autoNotes を生成
                      └─ userNotes を Firestore(daily/{targetDate}.cleaningBoardNotes) から読み込み
```

---
