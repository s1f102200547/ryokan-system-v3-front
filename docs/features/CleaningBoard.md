# CleaningBoard フィーチャー仕様

清掃ボード（V3）のフィーチャー仕様を定義する。スキーマは @Schema.md を参照。  
部屋状態の変数定義（ドメイン層）は @RoomStateDomain.md を参照。  
本ファイルは「RoomState変数を使ってCleaningBoardをどう表示するか」を定義する（Application/UI層の仕様）。

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

## 部屋の状態分類

状態変数の定義・有効な組み合わせ一覧は @RoomStateDomain.md を参照。  
以下では RoomStateDomain の変数名のみを使って CleaningBoard の各列を記述する。

### 連泊（isConsecutive）

「連泊カードを部屋に置くか否か」を示すフラグ。計算式・定義は @RoomStateDomain.md を参照。

判定対象の予約が異なるため 2 つのパターンに分かれる（直感）：

- **パターン A**（`stayingReservation` が対象）  
  昨夜から在室中のゲストに適用。「明日以降もまだ滞在するか？」を判定する。

- **パターン B**（`checkInReservation` が対象）  
  これから来るゲストに適用。「何泊するか？」を判定する。

### C/I 列

| 条件                         | 表示                               |
| -------------------------- | -------------------------------- |
| `isTodayCheckIn === true`  | `{adult_count}({child_count})`   |
| `isFutureCheckIn === true` | `({adult_count}({child_count}))` |
| 上記以外                       | `""`（空文字）                        |

- 子供が0人の場合は `({child_count})` 部分を省略。
- 本日空室&未来予約の場合は括弧()で囲む


## 備考欄（autoNotes）


| 条件 | 出力 |
|---|---|
| `isLateCheckout` | `"{room}: レイトアウト11:00"` |
| `isPreviousDayVacant` | `"{room}: 前日空室のためセットアップ済み"` |
| `isVacantTonight && !isPreviousDayVacant` | `"{room}: 本日空室のため次回の予約情報をもとにセットアップ"` |
| 上記いずれにも該当しない | `""` |

---

### 状態 × 出力 一覧

各列の出力は独立したルールで決定する。

| 列 | 定義 |
|---|---|
| `isConsecutive`（連泊） | @RoomStateDomain.md を参照 |
| C/I列 | 上記「C/I 列」表の通り |
| `autoNotes` | 後述「備考欄の自動生成ロジック」の通り |

---

## ユーザー入力備考（userNotes）

- `autoNotes` の下にテキストボックスを設置し、スタッフが印刷前に追記できる
- `userNotes` は **Firestore の `daily` コレクションに保存する**（スキーマは @Schema.md 参照）

---

## テーブル構造

- 7行固定（`ROOM_NUMBERS` 順）
- A4 横向き印刷を前提にスタイリングする
- 列構成（参考）: 部屋番号 / 滞在中ゲスト / C/I / 連泊 / 備考
- 参考: @cleaningBoard.png

---

## 日付切り替え（V3変更点）

- 「清掃ボード」・「予約状況」・「タイムテーブル」・「宿泊税表」など各ページが同じ `targetDate` を参照する

---
