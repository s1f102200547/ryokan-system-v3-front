# UI/UX 実装プラン

実装方針：**小さく完結する単位で順番に実装**する。各フェーズは独立してマージ可能にする。

---

## Phase 0: バグ修正 — safeBalanceChecker 非表示

### 背景
`/daily-dashboard` で `safeBalanceChecker` が表示されていない。
`getATaxTableUseCase` の返り値キーは `safeBalanceCheckers`（複数形）だが、
UI側でのキー参照ミスの可能性あり。

### タスク
- `ATaxTable.tsx` および関連コンポーネントで `safeBalanceCheckers` / `safeBalanceChecker` の参照ミスを特定・修正
- `/daily-dashboard` 上での表示箇所を確認し、表示されていない場合は `DailyDashboard.tsx` に `safeBalanceChecker` 表示を追加

### 影響範囲
- `src/components/aTaxTable/ATaxTable.tsx`
- `src/app/daily-dashboard/DailyDashboard.tsx`

---

## Phase 1: 予約カードグリッド再構成

### 目標
アサイン済み / 未アサイン / キャンセル済みの3セクション表示に再構成する。

### セクション定義

| セクション | 条件 | 表示 |
|---|---|---|
| アサイン済み | `room` が 21/22/31/32/42/43/61 のいずれか | 2列グリッド、部屋番号順固定 |
| 未アサイン | `room` が null / '' / 上記以外 | 2列グリッド |
| キャンセル済み | `cancel === 1` | 2列グリッド、デフォルト折りたたみ、カード小さめ |

### 部屋順（アサイン済み上段固定順）
```
61 → 43 → 42 → 32 → 31 → 22 → 21
```

### 空室カード
`computeRoomCheckInState`（`roomState.ts`）を使い、部屋に予約がない（`isTodayVacant === true`）場合は「＋」カードを表示。
クリックで `AddReservationDialog` を開き、その部屋を初期値にセット。

### 連泊中表示
`stayingReservation !== null && isStayingContinued === true` の部屋に「連泊中」バッジを表示。
ゲスト詳細は表示しない（バッジのみ）。

### カードUI変更
- Guest Name を最も大きく表示（h6相当）
- Room Number を左下に小さく表示（caption）
- キャンセルアイコン / 復帰アイコンを**カードから削除**（Phase 2のD&Dで代替）

### 変更ファイル
- `src/components/guestInfo/GuestInfoSection.tsx` — セクション分割ロジック
- `src/components/guestInfo/ReservationListCard.tsx` — カードUI変更
- `src/components/guestInfo/CancelledSection.tsx` — 折りたたみ対応

---

## Phase 2: Drag & Drop

### ライブラリ
`@dnd-kit/core` + `@dnd-kit/sortable`

### D&D移動ルール

| ドラッグ元 | ドラッグ先 | モーダル表示 | API呼び出し |
|---|---|---|---|
| アサイン済み / 未アサイン | キャンセル済み | キャンセル確認モーダル | cancel API |
| キャンセル済み | アサイン済み / 未アサイン | 復帰確認モーダル | restore API |
| アサイン済み | 未アサイン | なし | room=null PATCH |
| 未アサイン | アサイン済み（部屋カード上） | なし | room=部屋番号 PATCH |

### 実装方針
- `DndContext` を `GuestInfoSection` に配置
- `useDroppable` をセクションごとに設定
- ドロップ先がキャンセルセクション → `CancelDialog` を発火
- ドロップ先が通常セクション（キャンセル済みからの場合）→ `RestoreDialog` を発火
- アニメーションは `@dnd-kit/sortable` の `SortableContext` は使わず `DragOverlay` のみで対応（セクション間移動のため）

### 変更ファイル
- `src/components/guestInfo/GuestInfoSection.tsx` — `DndContext` ラップ、ドロップハンドラ追加
- `src/components/guestInfo/ReservationListCard.tsx` — `useDraggable` 追加

---

## Phase 3: カード内 A_tax 表示

### 表示条件
- アサイン済みカードのみ
- `check_in_date >= today`（当日以降）

### 表示内容
- `a_tax_received === true` または `booking_site === 'chillnn'`（免税）→「受領済み」小表示
- それ以外 → 未受領金額（`calcATax` で算出）を小表示

### 「受領済み」の定義
```ts
const isReceived = r.a_tax_received === true || isATaxExempt(r.booking_site)
```

### 変更ファイル
- `src/components/guestInfo/ReservationListCard.tsx` — A_tax表示追加
- `src/domain/reservation/bookingSitePolicy.ts` — `isATaxExempt` は既存関数を再利用

---

## Phase 4: 右サイド情報パネル

### 表示内容
- `safeBalanceChecker`（スタッフ名文字列） + `safeBalanceChecked`（boolean チェックボックス）
- 月間宿泊税合計金額（`selectedDate` の月の受領済み合計）

### safeBalanceChecked フィールド
- DB: `daily/{YYYY-MM-DD}` に `safeBalanceChecked: boolean` を追加
- API: `PATCH /api/daily/[date]/safe-balance-checker` に `checked: boolean` を追加（既存エンドポイント拡張）
- `DailyRepository` ポートに `updateSafeBalanceChecked(date, checked)` 追加

### 月間宿泊税合計
- `selectedDate` の年月で `/api/a-tax-table?year=&month=` を呼び出す
- `rows` から `isATaxExempt` でない予約の `tax` を合計して表示
- `useATaxTable` フックを再利用

### 変更ファイル
- `src/app/daily-dashboard/DailyDashboard.tsx` — 右パネル追加
- `src/domain/ports/dailyRepository.ts` — ポート拡張
- `src/infra/daily/firestoreDailyRepository.ts` — Firestore 書き込み追加
- `src/app/api/daily/[date]/safe-balance-checker/route.ts` — `checked` フィールド対応

---

## Phase 5: カード内ゲスト情報コンパクト表示

### 表示対象フィールド
`arrival_time` / `open_air_bath_time[0]` / `dinner_time[0]` / `breakfast_time[0]` / `late_out`

### 表示ルール
- 値が未定（null / 'NONE' / 'PENDING'）なら非表示
- 表示は1行ずつ `caption` サイズ
- スペース不足時は `...` で省略

### 表示例
```
arrival 15:00
dinner1 18:00
```

### 変更ファイル
- `src/components/guestInfo/ReservationListCard.tsx`

---

## Phase 6: TODO機能

### タブ構成
1. 「当日やることTODO」
2. 「当日までにやることTODO」

デフォルト表示：`selectedDate <= today` なら Tab1、`selectedDate > today` なら Tab2。

---

### Tab 1: 当日やることTODO

#### 宿泊税締め
```
[checkbox] 宿泊税締め  xxx円（selectedDateの月の合計）  [名前入力欄]
```
- checkbox ON = `safeBalanceChecked: true` を `daily/{date}` に保存
- 名前入力 = `safeBalanceChecker` に保存（Phase 4と共通）

#### 宿泊税受け取り
```
[checkbox] {guest_name}  {room}  宿泊税 xxx円  [名前入力欄]
```
- 対象：当日滞在中ゲスト（`stayingReservation !== null` または `isTodayCheckIn`）かつ `isATaxExempt === false`
- checkbox ON = `a_tax_received: true` + スタッフ名を保存（既存 `useUpdateATax` を再利用）

#### タイムテーブル印刷
```
[checkbox] {mm/dd} タイムテーブル印刷  [印刷ボタン]
```
- 対象：`selectedDate` から2日後まで滞在予定のゲスト（連泊終了日含む）
- DB: `daily/{YYYY-MM-DD}` に `timetable_printed: boolean` を追加
- 印刷ボタン = 既存 `TimetablePrintContent` を呼び出す

#### 翌日清掃ボード印刷
```
[checkbox] 翌日清掃ボード印刷  [印刷ボタン]
```
- DB: `daily/{YYYY-MM-DD}` に `cleaning_board_printed: boolean` を追加
- 印刷ボタン = 既存 `CleaningBoardPrintContent` を呼び出す

---

### Tab 2: 当日までにやることTODO

#### 到着時間 ask
```
[checkbox（読み取り専用）] {guest_name}  到着時間ask
```
- 対象：当日チェックインゲスト
- `arrival_time !== null` かつ `arrival_time !== 'PENDING'` → checked
- DB保存しない、編集不可

#### 夕食時間・アレルギー ask
```
[checkbox（読み取り専用）] {guest_name}  夕食時間ask
```
- 対象外：`dinner_time[0] === 'NONE'`、キャンセル済み
- `dinner_time[0]` が時刻指定済み（`HH:MM` 形式）→ checked、未定 → unchecked
- DB保存しない

---

### 新規 DB フィールド（`daily/{YYYY-MM-DD}`）
| フィールド | 型 | 説明 |
|---|---|---|
| `safeBalanceChecked` | boolean | 宿泊税締めチェック |
| `timetable_printed` | boolean | タイムテーブル印刷済み |
| `cleaning_board_printed` | boolean | 清掃ボード印刷済み |

### 新規 API
- `GET/PATCH /api/daily/[date]` — 上記フィールドの読み書き（または既存エンドポイント拡張）

### 変更ファイル
- `src/domain/ports/dailyRepository.ts`
- `src/infra/daily/firestoreDailyRepository.ts`
- `src/app/api/daily/[date]/route.ts`（新規）
- `src/hooks/daily/useDaily.ts`（新規）
- `src/app/daily-dashboard/DailyDashboard.tsx`
- `src/components/dailyDashboard/TodoPanel.tsx`（新規）

---

## Phase 7: ナビゲーション（ハンバーガーメニュー）

### 要件
- 画面左上に MUI `MenuIcon`
- クリックで MUI `Drawer`（左から出現）
- リンク：`/daily-dashboard`、`/a_tax_table`

### 変更ファイル
- `src/app/layout.tsx` または `src/app/daily-dashboard/DailyDashboard.tsx`（スコープ確認後決定）
- `src/components/NavDrawer.tsx`（新規）

---

## Phase 8: 印刷ボタン改善

### 変更内容
現状の汎用 `PrintIcon` × 2 を、ラベル付きボタンに変更。

```
[当日タイムテーブル] [当日清掃ボード]
```

### 変更ファイル
- `src/app/daily-dashboard/DailyDashboard.tsx`

---

## Phase 9: /a_tax_table シンプル化

### 変更内容
- 編集機能をすべて削除（`useUpdateATax` の呼び出し箇所を除去）
- CSVダウンロードボタンを追加
  - クライアントサイドで `rows` を CSV 文字列に変換して `<a download>` でダウンロード
  - カラム：`check_in_date`, `guest_name`, `room`, `nights`, `adult_count`, `tax`, `a_tax_received`

### 変更ファイル
- `src/components/aTaxTable/ATaxTable.tsx`
- `src/components/aTaxTable/ReservationTable.tsx`

---

## 実装順序まとめ

| # | フェーズ | 工数感 | 依存 |
|---|---|---|---|
| 0 | safeBalanceChecker バグ修正 | 小 | なし |
| 1 | カードグリッド再構成 | 中 | なし |
| 2 | Drag & Drop | 大 | Phase 1 |
| 3 | カード内 A_tax 表示 | 小 | Phase 1 |
| 4 | 右サイドパネル | 中 | なし |
| 5 | カード内ゲスト情報 | 小 | Phase 1 |
| 6 | TODO機能 | 大 | Phase 4 |
| 7 | ハンバーガーメニュー | 小 | なし |
| 8 | 印刷ボタン改善 | 小 | なし |
| 9 | /a_tax_table シンプル化 | 小 | なし |
