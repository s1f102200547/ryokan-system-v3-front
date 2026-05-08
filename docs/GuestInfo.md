# GuestInfo — 予約管理フィーチャー

## 概要

日次ダッシュボード（`/daily-dashboard`）に表示される予約カード一覧と、そこから開く編集モーダルを中心とした機能。

- 選択日の C/I 予約を一覧表示（通常 / キャンセル 別セクション）
- モーダルで各フィールドを auto-save 編集（debounce 500ms）
- 手動新規追加・キャンセル・復活（操作履歴を `mail_memo` に記録）

---

## 画面構成

```
DailyDashboard
└── GuestInfoSection（日付ごとに remount しない。refreshKey で再フェッチ）
    ├── ReservationListCard × n  ──→ ReservationModal（クリックで開く）
    │                                 ├── C/I前タブ: ReservationCardSet1
    │                                 │   ├── ReservationEditorList（各フィールド折りたたみ）
    │                                 │   └── MailMemo（mail_memo 表示）
    │                                 └── C/I後タブ: ReservationCardSet2
    │                                     （宿泊税・マーケティング情報）
    ├── AddReservationCard（＋カード）──→ AddReservationDialog
    └── CancelledSection（キャンセル予約一覧）
        └── ReservationListCard × n ──→ RestoreDialog（復活操作）
    CancelDialog（キャンセル操作、ReservationListCard のボタンから開く）
```

---

## API エンドポイント

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/guest-info?date=YYYY-MM-DD` | 指定日の C/I 予約一覧（normal / cancelled） |
| POST | `/api/reservations` | 手動新規追加 |
| PATCH | `/api/reservations/[id]` | フィールド部分更新（auto-save） |
| PATCH | `/api/reservations/[id]/cancel` | キャンセル |
| PATCH | `/api/reservations/[id]/restore` | キャンセル復活 |

### PATCH /api/reservations/[id] — 更新可能フィールド

`ReservationPatch` の任意サブセット。空オブジェクトは 400。

- 基本: `guest_name`, `room`, `adult_count`, `child_count`, `check_out_date`
- 到着: `arrival_time`, `late_out`
- 夜数配列（`check_out_date` 変更時は `resizeNightFields` で同時更新）: `dinner_time`, `dinner_info`, `breakfast_time`, `open_air_bath_time`, `timetable_info`
- C/I後: `mail_memo`, `a_tax_received`, `a_tax_received_by_staff_name`, `check_in_staff_name`, `country`, `city`, `age_groups`, `group_type`, `purpose`, `tourism_type`, `profession`, `other_note`

---

## データフロー

### 読み取り

```
useGuestInfo(targetDate, refreshKey)
  └── GET /api/guest-info?date=...
        └── getGuestInfoUseCase(date)
              └── firestoreReservationRepository.fetchByDateRange(date, date)
                    └── Firestore: guestInfoV2 WHERE check_in_date == date
```

`isLoading` の判定は `stateKey（targetDate-refreshKey）` の一致で行う。初回は spinner、refresh 中は既存データを薄く表示（opacity: 0.35）。

### 書き込み（auto-save）

```
入力操作
  → handleFieldChange（ReservationModal）
      → pendingPayloadRef に蓄積
      → debouncedUpdate(id) ←──── 500ms debounce（各入力で reset）
            ↓ flush（blur 時）または自然発火
      → execute(id, payload)（useUpdateReservation）
            → PATCH /api/reservations/[id]
                  → updateReservationCommand
                        → firestoreReservationRepository.updateReservation
```

**onBlurFlush**: CardSet1 左ボックス・CardSet2 全体に `onBlur={onBlurFlush}` を設定。ボックス外へフォーカスが移るタイミングで即時 flush。

### 書き込み（キャンセル / 復活 / 新規追加）

```
CancelDialog / RestoreDialog / AddReservationDialog
  → execute（useCancelReservation / useRestoreReservation / useAddReservation）
      → PATCH /api/reservations/[id]/cancel|restore
         POST /api/reservations
          → cancelReservationCommand / restoreReservationCommand / addReservationCommand
              → firestoreReservationRepository.cancelReservation|restoreReservation|addReservation
                  ← mail_memo へ MailMemoEntry を追記
              → notifySlackFireAndForget（fire-and-forget）
```

---

## auto-save 保存状態

`useUpdateReservation` が管理する `SaveStatus`:

| 状態 | アイコン | data-status |
|---|---|---|
| `saving` | CloudUploadIcon（グレー） | `saving` |
| `saved` | CloudDoneIcon（緑） | `saved` |
| `error` | ErrorOutlineIcon（赤） + Snackbar | `error` |
| `idle` | 非表示 | — |

E2E テストでは `[data-testid="save-status"][data-status="saved"]` で検証。

---

## mail_memo エントリ構造

操作のたびに Firestore `mail_memo` 配列に `FieldValue.arrayUnion` で追記。

| フィールド | 新規追加 | キャンセル | 復活 |
|---|---|---|---|
| `month` / `day` | 操作日時 | `targetDate` の月/日 | `targetDate` の月/日 |
| `name` | `staff_name` | `staffName` | `staffName` |
| `summary` | `'手動で新規追加'` | `'手動キャンセル'` | `'手動キャンセル復活'` |
| `text` | `add_reason` | `reason` | `reason` |
| `source` | `'システム'` | `'システム'` | `'システム'` |

---

## ReservationEditorList — セクション構成

全セクションはデフォルト折りたたみ。クリックで `Collapse`（MUI）展開。

| セクションキー | ラベル | 対象フィールド |
|---|---|---|
| `guestName` | `name` | `guest_name` |
| `room` | `room` | `room` |
| `count` | `number` | `adult_count`, `child_count` |
| `checkout` | `C/O date` | `check_out_date`（変更時に夜数配列も resize） |
| `arrival` | `arrival` | `arrival_time` |
| `roten` | `openAirBath` | `open_air_bath_time[i]` |
| `dinner` | `dinner` | `dinner_time[i]`, `dinner_info[i]` |
| `breakfast` | `breakfast` | `breakfast_time[i]` |
| `lateOut` | `lateOut` | `late_out` |
| `timetable` | `timeTableMemo` | `timetable_info[i]` |

---

## 夜数連動フィールド

`check_out_date` 変更時、`domain/reservation/nightArrays.ts` の `resizeNightFields` で配列長を揃える。

- 短縮: 末尾をトリム
- 延長: デフォルト値で補完（`dinner_time` → `'NONE'`、`breakfast_time` / `open_air_bath_time` → `null`、他 → `''`）

---

## Firestore コレクション

`guestInfoV2` — クエリキー: `check_in_date`（`YYYY/MM/DD` 形式）

スキーマ詳細は [`docs/Schema/Reservations.md`](Schema/Reservations.md) 参照。
