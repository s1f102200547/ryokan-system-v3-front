# 部屋の状態定義（共通）

各機能（CleaningBoard / Atax / Timetable など）が共通で使う部屋状態の変数定義。  
実装は `src/domain/room/` にカプセル化する。各機能は**内部条件式を直接参照せず、ここで定義した変数名のみを使ってロジックを記述する**。

DBフィールドの定義は @Schema.md を参照。

> **`Reservation` 型**: `reservations` コレクションの1ドキュメントに対応する型。フィールド定義は @Schema.md の `reservations` コレクションを参照。

---

## 前提

- `targetDate` の朝（ゲストがチェックアウトした後）時点を基準とする
- `cancel === 1` の予約は全判定から除外する

---

## 予約単体の算出値

### `nights`（泊数）

```
nights = check_out_date - check_in_date（日数）
```

---

## 滞在状況（stayingReservation 系）

### `stayingReservation`（滞在中の予約）

```
条件: check_in_date < targetDate かつ check_out_date > targetDate
型:   Reservation | null
```
昨夜から在室しているゲストの予約（スタッフが朝到着した時点で部屋にいる人）。  
`null` の場合は今朝CO済みか空室。  
`isTodayCheckIn`（当日CI）とは排他 — 今日チェックインするゲストはまだ来ていないため含まない。

---

### `isStayingContinued`（滞在継続中）

```
条件: stayingReservation !== null かつ stayingReservation.check_out_date > targetDate + 1
型:   boolean
```

今夜も翌日以降も同一ゲストが継続して滞在する。

---

### `isLastNight`（最終夜）

```
条件: stayingReservation !== null かつ stayingReservation.check_out_date === targetDate + 1
型:   boolean
```

今夜が最終泊で、明朝チェックアウトする。

---

### `isCheckedOutToday`（本日チェックアウト済み）

```
条件: stayingReservation === null かつ check_out_date === targetDate の予約が存在する
型:   boolean
```

「前のゲストが今朝出たか否か」だけを表す。次に泊まる人がいるかどうかは checkInReservation 系の変数が別途担う。

---

## 次の予約（checkInReservation 系）

### `checkInReservation`（次のチェックイン予約）

```
条件: check_in_date >= targetDate を満たす直近の予約
型:   Reservation | null
```

> `isStayingContinued` のとき同一ゲストが部屋を占有しているため常に `null`。

---

### `isTodayCheckIn`（当日チェックイン）

```
条件: checkInReservation !== null かつ checkInReservation.check_in_date === targetDate
型:   boolean
```

---

### `isFutureCheckIn`（未来チェックイン）

```
条件: checkInReservation !== null かつ checkInReservation.check_in_date > targetDate
型:   boolean
```

---

### `isConsecutiveCheckIn`（チェックイン予約が連泊）

```
条件: checkInReservation !== null かつ checkInReservation.nights >= 2
型:   boolean
```
本日チェックインor未来チェックイン関係なく２泊以上の場合はTrue
---

## 空室・前日空室

### `isTodayVacant`（当日空室）

```
条件: stayingReservation === null かつ isTodayCheckIn === false
型:   boolean
```

今夜その部屋に誰もいない（CO済み or 前日空室&当日CIもなし）。

---

### `isPreviousDayVacant`（前日空室）

```
条件: targetDate - 1 にその部屋の有効予約（cancel !== 1）が存在しない
型:   boolean
```

昨日も誰もいなかった。`isCheckedOutToday` のときは前日に在室ゲストがいるため必ず `false`。

---

## その他

### `isLateCheckout`（レイトアウト）

```
条件: isLastNight === true かつ stayingReservation.late_out === true
型:   boolean
```

明朝チェックアウト予定かつレイトアウト設定あり（11:00 まで延長）。


---
