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

「連泊カードを部屋に置くか否か」を示すフラグ。判定対象の予約が異なるため 2 つのパターンに分かれる。**簡略化しないこと。**

- **パターン A**（`stayingReservation` が対象）  
  昨夜から在室中のゲストに適用。「明日以降もまだ滞在するか？」を判定する。  
  含意ルールより `isStayingContinued` と `isLastNight` は排他かつ `stayingReservation !== null` の全ケースを網羅するため、**`isConsecutive = isStayingContinued`** と等価。

- **パターン B**（`checkInReservation` が対象）  
  これから来るゲストに適用。「何泊するか？」を `nights` で判定する。  
  **`isConsecutive = isConsecutiveCheckIn`** と等価。

```
isConsecutive =
  stayingReservation !== null
    ? isStayingContinued   // パターン A
    : isConsecutiveCheckIn // パターン B
```

### C/I 列

| 条件                         | 表示                               |
| -------------------------- | -------------------------------- |
| `isTodayCheckIn === true`  | `{adult_count}({child_count})`   |
| `isFutureCheckIn === true` | `({adult_count}({child_count}))` |
| 上記以外                       | `""`（空文字）                        |

- 子供が0人の場合は `({child_count})` 部分を省略。
- 本日空室&未来予約の場合は括弧()で囲む

### 状態 × 出力 一覧(変更必須)

`autoNotes` は優先度順評価（詳細は「備考欄の自動生成ロジック」を参照）。

---

#### ケース A-1：連泊継続中

**意味**: 昨夜からのゲストが今夜以降も滞在を続ける。部屋はそのまま。

**条件（状態）**:
- 滞在状況: `isStayingContinued`（滞在継続中）
- 次の予約: なし（`isStayingContinued`（滞在継続中）のとき `checkInReservation`（次のチェックイン予約）は常に `null`）

**出力**:
- `isConsecutive`（連泊）: `true`
- C/I列: 空欄
- `autoNotes`: `""`

---

#### ケース B-1：最終夜・次の予約なし

**意味**: 昨夜からのゲストが今夜チェックアウトする。明日以降の予約はない。

**条件（状態）**:
- 滞在状況: `isLastNight`（最終夜）
- 次の予約: なし

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: 空欄
- `autoNotes`: `isLateCheckout`（レイトアウト）（優先度1。非該当なら `""`）

---

#### ケース B-2：最終夜・未来CI（1泊）

**意味**: 昨夜からのゲストが今夜チェックアウトし、別のゲストが将来チェックインする（1泊のみ）。

**条件（状態）**:
- 滞在状況: `isLastNight`（最終夜）
- 次の予約: `isFutureCheckIn`（未来チェックイン）かつ `!isConsecutiveCheckIn`（1泊のみ）

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: `(人数)` ← 括弧あり（未来CI）
- `autoNotes`: `isLateCheckout`（レイトアウト）（優先度1。非該当なら `""`）

---

#### ケース B-3：最終夜・未来CI（連泊）

**意味**: 昨夜からのゲストが今夜チェックアウトし、別のゲストが将来チェックインする（2泊以上）。

**条件（状態）**:
- 滞在状況: `isLastNight`（最終夜）
- 次の予約: `isFutureCheckIn`（未来チェックイン）かつ `isConsecutiveCheckIn`（チェックイン予約が連泊）

**出力**:
- `isConsecutive`（連泊）: `false`（連泊カードは次のゲスト用だが、今夜は最終夜なのでまだ不要）
- C/I列: `(人数)` ← 括弧あり（未来CI）
- `autoNotes`: `isLateCheckout`（レイトアウト）（優先度1。非該当なら `""`）

---

#### ケース C-1：本日CO→本日CI（1泊）

**意味**: 今朝チェックアウトがあり、今日別のゲストがチェックインする（1泊のみ）。

**条件（状態）**:
- 滞在状況: `isCheckedOutToday`（本日チェックアウト済み）
- 次の予約: `isTodayCheckIn`（当日チェックイン）かつ `!isConsecutiveCheckIn`（1泊のみ）

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: `人数` ← 括弧なし（当日CI）
- `autoNotes`: `""`

---

#### ケース C-2：本日CO→本日CI（連泊）

**意味**: 今朝チェックアウトがあり、今日別のゲストがチェックインする（2泊以上）。

**条件（状態）**:
- 滞在状況: `isCheckedOutToday`（本日チェックアウト済み）
- 次の予約: `isTodayCheckIn`（当日チェックイン）かつ `isConsecutiveCheckIn`（チェックイン予約が連泊）

**出力**:
- `isConsecutive`（連泊）: `true`
- C/I列: `人数` ← 括弧なし（当日CI）
- `autoNotes`: `""`

---

#### ケース C-3：本日CO・未来CI（1泊）

**意味**: 今朝チェックアウトがあり、将来チェックインがある（1泊のみ）。今夜は空室。

**条件（状態）**:
- 滞在状況: `isCheckedOutToday`（本日チェックアウト済み）
- 次の予約: `isFutureCheckIn`（未来チェックイン）かつ `!isConsecutiveCheckIn`（1泊のみ）

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: `(人数)` ← 括弧あり（未来CI）
- `autoNotes`: `isTodayVacant`（当日空室）（優先度3。非該当なら `""`）

---

#### ケース C-4：本日CO・未来CI（連泊）

**意味**: 今朝チェックアウトがあり、将来チェックインがある（2泊以上）。今夜は空室。

**条件（状態）**:
- 滞在状況: `isCheckedOutToday`（本日チェックアウト済み）
- 次の予約: `isFutureCheckIn`（未来チェックイン）かつ `isConsecutiveCheckIn`（チェックイン予約が連泊）

**出力**:
- `isConsecutive`（連泊）: `true`
- C/I列: `(人数)` ← 括弧あり（未来CI）
- `autoNotes`: `isTodayVacant`（当日空室）（優先度3。非該当なら `""`）

---

#### ケース C-5：本日CO・次の予約なし

**意味**: 今朝チェックアウトがあり、次の予約が入っていない。今夜以降も空室。

**条件（状態）**:
- 滞在状況: `isCheckedOutToday`（本日チェックアウト済み）
- 次の予約: なし

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: 空欄
- `autoNotes`: `isTodayVacant`（当日空室）（優先度3。非該当なら `""`）

---

#### ケース D-1：空室継続・本日CI（1泊）

**意味**: 昨夜から誰もおらず（前日空室または前回COが昨日以前）、今日初めてゲストがチェックインする（1泊のみ）。

**条件（状態）**:
- 滞在状況: `!isCheckedOutToday`（本日CO前）かつ `stayingReservation === null`（滞在中の予約なし）
- 次の予約: `isTodayCheckIn`（当日チェックイン）かつ `!isConsecutiveCheckIn`（1泊のみ）

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: `人数` ← 括弧なし（当日CI）
- `autoNotes`: `isPreviousDayVacant`（前日空室）（優先度2。非該当なら `""`）

---

#### ケース D-2：空室継続・本日CI（連泊）

**意味**: 昨夜から誰もおらず、今日初めてゲストがチェックインする（2泊以上）。

**条件（状態）**:
- 滞在状況: `!isCheckedOutToday`（本日CO前）かつ `stayingReservation === null`（滞在中の予約なし）
- 次の予約: `isTodayCheckIn`（当日チェックイン）かつ `isConsecutiveCheckIn`（チェックイン予約が連泊）

**出力**:
- `isConsecutive`（連泊）: `true`
- C/I列: `人数` ← 括弧なし（当日CI）
- `autoNotes`: `isPreviousDayVacant`（前日空室）（優先度2。非該当なら `""`）

---

#### ケース D-3：空室継続・未来CI（1泊）

**意味**: 昨夜から誰もおらず、将来チェックインがある（1泊のみ）。今夜も空室。

**条件（状態）**:
- 滞在状況: `!isCheckedOutToday`（本日CO前）かつ `stayingReservation === null`（滞在中の予約なし）
- 次の予約: `isFutureCheckIn`（未来チェックイン）かつ `!isConsecutiveCheckIn`（1泊のみ）

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: `(人数)` ← 括弧あり（未来CI）
- `autoNotes`: `isPreviousDayVacant`（前日空室）（優先度2）または `isTodayVacant`（当日空室）（優先度3）※どちらが先に一致するかによる

---

#### ケース D-4：空室継続・未来CI（連泊）

**意味**: 昨夜から誰もおらず、将来チェックインがある（2泊以上）。今夜も空室。

**条件（状態）**:
- 滞在状況: `!isCheckedOutToday`（本日CO前）かつ `stayingReservation === null`（滞在中の予約なし）
- 次の予約: `isFutureCheckIn`（未来チェックイン）かつ `isConsecutiveCheckIn`（チェックイン予約が連泊）

**出力**:
- `isConsecutive`（連泊）: `true`
- C/I列: `(人数)` ← 括弧あり（未来CI）
- `autoNotes`: `isPreviousDayVacant`（前日空室）（優先度2）または `isTodayVacant`（当日空室）（優先度3）※どちらが先に一致するかによる

---

#### ケース D-5：空室継続・次の予約なし

**意味**: 昨夜から誰もおらず、次の予約も入っていない。完全に空室。

**条件（状態）**:
- 滞在状況: `!isCheckedOutToday`（本日CO前）かつ `stayingReservation === null`（滞在中の予約なし）
- 次の予約: なし

**出力**:
- `isConsecutive`（連泊）: `false`
- C/I列: 空欄
- `autoNotes`: `isPreviousDayVacant`（前日空室）（優先度2）または `isTodayVacant`（当日空室）（優先度3）※どちらが先に一致するかによる

---

## 備考欄（autoNotes）の自動生成ロジック

優先度順に評価し、最初に一致した出力を使用する。

| 優先度 | 条件 | 出力 |
|---|---|---|
| 1 | `isLateCheckout` | `"レイトアウト11:00"` |
| 2 | `isPreviousDayVacant` | `"{room}: 前日空室のためセットアップ済み"` |
| 3 | `isTodayVacant` | `"{room}: 本日空室のため次回の予約情報をもとにセットアップ"` |
| 4 | どれにも当てはまらない | `""` |

各変数の定義は @RoomStateDomain.md を参照。

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

- 日付は MUI DatePicker で選択し、アプリ全体のグローバル state（Context）で共有する
- 「清掃ボード」・「予約状況」・「タイムテーブル」・「宿泊税表」など各ページが同じ `targetDate` を参照する
- V2 は「翌日固定」だったが V3 では任意の日付に選択切り替え可能

---
