# ATax Table — 宿泊税管理フィーチャー

## 概要

`/a_tax_table` ページで提供する月次の宿泊税受領状況テーブル。

- 先月 / 今月 の切り替え表示
- Chillnn 以外の予約に対して宿泊税受領済みフラグを管理（楽観的 UI）
- 月締めスタッフ名の入力
- 先月分 CSV エクスポート（大人人数×泊数・受領額集計付き）

---

## 画面構成

```
/a_tax_table（page.tsx — Client Component）
└── ATaxTable
    ├── MonthSelector（先月 / 今月 ButtonGroup）
    └── ATaxTableBody（key=year-month で月切り替え時 remount）
        ├── BalanceDisplay（受領済み合計・月合計 大人×泊数）
        ├── CSVダウンロードボタン（先月表示時のみ）
        └── ReservationTable
            └── 行ごと
                ├── ATaxCheckboxCell（a_tax_received）
                ├── StaffNameCell（a_tax_received_by_staff_name、onBlur 保存）
                └── SafeBalanceCheckerCell（締めスタッフ名、onBlur 保存）
```

---

## API エンドポイント

| メソッド | パス | 概要 |
|---|---|---|
| GET | `/api/a-tax-table?year=YYYY&month=M` | 指定月の宿泊税テーブルデータ取得 |
| PATCH | `/api/reservations/[id]/a-tax` | `a_tax_received` / `a_tax_received_by_staff_name` 更新 |
| PATCH | `/api/daily/[date]/safe-balance-checker` | 締めスタッフ名更新 |

### GET /api/a-tax-table レスポンス

```typescript
{
  rows: ATaxTableRow[]           // Reservation + nights + tax
  safeBalanceCheckers: Record<string, string>  // check_in_date → staffName
}
```

### PATCH /api/reservations/[id]/a-tax ボディ

```typescript
{
  a_tax_received?: boolean
  a_tax_received_by_staff_name?: string  // max 100文字
}
// 空オブジェクトは 400
```

---

## データフロー

### 読み取り

```
useATaxTable(year, month)
  └── GET /api/a-tax-table?year=&month=
        └── getATaxTableUseCase(year, month)
              ├── firestoreReservationRepository.fetchByMonth(year, month)
              │     └── Firestore: guestInfoV2 WHERE check_in_date >= YYYY/MM/01 AND < 翌月
              └── firestoreDailyRepository.fetchSafeBalanceCheckers(uniqueDates)
                    └── Firestore: daily/{YYYY-MM-DD} の safeBalanceChecker フィールド
```

`isLoading` は `fetchedKey（"${year}-${month}"）` の一致で判定。月切り替え時は新しい key になるため即 `isLoading: true`。

### 書き込み（チェックボックス）

楽観的 UI: `setLocalATaxReceived` でローカル state を即時更新 → 画面反映後に非同期で API 呼び出し。

```
ATaxCheckboxCell.onChange
  → onToggle(id, checked)（ATaxTableBody → ATaxTable → ReservationTable）
      → setLocalATaxReceived（即時 UI 反映）
  → useUpdateATax.execute(id, { a_tax_received: checked })
      → PATCH /api/reservations/[id]/a-tax
            → firestoreReservationRepository.updateATax
```

月切り替えで `ATaxTableBody` が `key` により remount → `localATaxReceived` はリセット。

### 書き込み（スタッフ名・締めスタッフ名）

`onBlur` 時のみ保存（値が変わっていない場合はスキップ）。

```
StaffNameCell.onBlur
  → useUpdateATax.execute(id, { a_tax_received_by_staff_name: text })
      → PATCH /api/reservations/[id]/a-tax

SafeBalanceCheckerCell.onBlur
  → useUpdateSafeBalanceChecker.execute(date, text)
      → PATCH /api/daily/[date]/safe-balance-checker
```

---

## ATaxTableRow — computed フィールド

`getATaxTableUseCase` が Reservation を拡張して計算。Firestore には保存しない。

| フィールド | 計算式 |
|---|---|
| `nights` | `dateDiff(check_in_date, check_out_date)` |
| `tax` | Chillnn → `0`、その他 → `adult_count × nights × A_TAX_RATE_PER_PERSON_PER_NIGHT` |

---

## ProcessedRow — 表示用加工フィールド

`computeProcessedRows`（pure function）が各行に追加。

| フィールド | 説明 |
|---|---|
| `isLastDate` | 同日 C/I の最後の行なら `true` |
| `safeBalanceChecker` | `isLastDate` の行のみ締めスタッフ名を表示、それ以外は `''` |
| `adultNightSum` | `isLastDate` の行のみ日合計（chillnn または受領済みの大人×泊数）、それ以外は `null` |

---

## 宿泊税計算ルール

```typescript
// domain/reservation/bookingSitePolicy.ts
isATaxExempt(bookingSite)  // chillnn → true（免除）
calcATax(adultCount, nights, ratePerPersonPerNight)
```

`A_TAX_RATE_PER_PERSON_PER_NIGHT` は `src/constants/guestInfo.ts` で定義。

---

## CSV エクスポート

先月表示時のみボタンが現れる。BOM 付き UTF-8 CSV を `<a>` タグでダウンロード。

**列構成**（左から）:
受領済み / C/I日 / 部屋 / ゲスト名 / 大人人数 / 泊数 / 予約サイト / 宿泊税 / 受領スタッフ名 / 締めスタッフ名 / 大人×泊数

最終行に「合計」行（大人×泊数の月合計）を付与。

ファイル名: `{year}-{MM}-a-tax.csv`

---

## Firestore コレクション

| コレクション | 用途 |
|---|---|
| `guestInfoV2` | 予約データ（`a_tax_received`, `a_tax_received_by_staff_name` 等を保存） |
| `daily/{YYYY-MM-DD}` | 締めスタッフ名（`safeBalanceChecker` フィールド）を保存 |

スキーマ詳細は [`docs/Schema/Reservations.md`](Schema/Reservations.md) 参照。
