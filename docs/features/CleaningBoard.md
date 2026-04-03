# CleaningBoard フィーチャー仕様

清掃ボード（V3）のフィーチャー仕様を定義する。スキーマは docs/Schema/* を参照。  
部屋状態の変数定義（ドメイン層）は @RoomState.md を参照。  
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

## Firestore

- コレクション: `guestInfoV2`
- `check_in_date` / `check_out_date` は Firestore 上 `YYYY/MM/DD` 形式、domain層では `YYYY-MM-DD` に変換して扱う

---

## 部屋の状態分類

状態変数の定義・有効な組み合わせ一覧は @RoomState.md を参照。  
以下では RoomState の変数名のみを使って CleaningBoard の各列を記述する。

---

## 伝達事項列

| 条件 | 表示 |
|---|---|
| `isConsecutive === true` | `"連泊(札置く)"` |
| 上記以外 | `""` |

`isConsecutive` の定義は @RoomState.md を参照。  
`stayingReservation` があれば `isStayingContinued`、なければ `isConsecutiveCheckIn` を使う。
※Consecutiveの意味は「連続した、連なる」
---

## C/I 列

| 条件                         | 表示                               |
| -------------------------- | -------------------------------- |
| `isTodayCheckIn === true`  | `{adult_count}({child_count})`   |
| `isFutureCheckIn === true` | `({adult_count}({child_count}))` |
| 上記以外                       | `""`（空文字）                        |

- 子供が0人の場合は `({child_count})` 部分を省略
- 未来予約の場合は全体を括弧 `()` で囲む
- 人数は `checkInReservation` から取得

---

## 連泊列（人数）

| 条件 | 表示 |
|---|---|
| `isStayingContinued === true` | `{adult_count}({child_count})`（`stayingReservation` の人数） |
| 上記以外 | `""` |

- 子供が0人の場合は `({child_count})` 部分を省略

---

## 備考欄（autoNotes）

| 条件 | 出力 |
|---|---|
| `isLateCheckout` | `"{room}: レイトアウト11:00"` |
| `isPreviousDayVacant` | `"{room}: 前日空室のためセットアップ済み"` |
| `isTodayVacant && !isPreviousDayVacant` | `"{room}: 本日空室のため次回の予約情報をもとにセットアップ"` |
| 上記いずれにも該当しない | `""` |

---

## ユーザー入力備考（userNotes）

- `autoNotes` の下にテキストボックスを設置し、スタッフが印刷前に追記できる
- `userNotes` は **Firestore の `daily` コレクションに保存する**

---

## テーブル構造

- 7行固定（`ROOM_NUMBERS` 順）
- A4 横向き印刷を前提にスタイリングする
- 列構成: 部屋番号 / 伝達事項 / 浴衣サイズ / C/I / 連泊 / 清掃 / 布団 / タオル2点 / バスマット / シャンプー / 歯ブラシ等 / 水コップ / ティッシュ / ゴミ箱 / 掛け花 / トイレペーパー / ライト(連泊) / 清掃担当メモ
- 参考: @cleaningBoard.png

---

## 日付切り替え（V3変更点）

- 「清掃ボード」・「予約状況」・「タイムテーブル」・「宿泊税表」など各ページが同じ `targetDate` を参照する
- デフォルトは当日（`new Date().toISOString().slice(0, 10)`）

---
