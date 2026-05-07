# GuestInfo / a_tax_table 全体実装計画

## Context

`docs/GuestInfo.md` に基づき `/daily-dashboard` へのguestInfo追加・キャンセル/復活/手動予約追加機能・`/a_tax_table` を実装する。
v2コードはUI/UXの参考のみ。v3アーキテクチャ（Layered Architecture + Repository Pattern）で設計し直す。
---

## 0. 決定事項

| 項目 | 決定 |
|---|---|
| `booking_site` | 小文字変換後、`chillnn/booking.com/expedia` 以外は `'other'` に正規化 |
| `tax` | Firestoreに保存しない。`adult_count × nights × A_TAX_RATE` でその場計算 |
| `A_TAX_RATE` | **実装前に定数値を確認すること**（例: ¥200/人/泊）→ `src/constants/guestInfo.ts` に定義 |
| `communication_note` | v3では含めない |
| `cancel_lock` | v3では含めない（`cancel: 0/1` のみ） |
| モーダル保存 | auto saving（debounce 500ms、pendingPayloadRef蓄積方式）。保存ボタンなし |
| キャンセル/復活/新規追加 | 明示的ボタン操作のみ（非auto-save） |
| a_tax_table チェックボックス | 即時保存（debounce 0ms） |
| `reservation_number`（手動予約追加時） | UUID v7（`uuid` パッケージ） |

---

## 0. 既存方針踏襲

```
Unit test（Domain層）  ← 「最も多く書く」
Integration test       ← 「Route Handler（API）の"入口->出口"を検証」
E2E test（Playwright） ← 「重要フローのみ」
```

 機能ごとに E2E → domainの unit test -> domain → infra → application → hooks → integration test -> UI の順で縦断実装

---

## 1. 型定義

### `src/constants/guestInfo.ts`（既存の A_TAX_RATE に加えて選択肢も定義）

`reference/v2/GuestInfo/reservationOptions.js` を TypeScript 化して移植する:

```typescript
export const A_TAX_RATE_PER_PERSON_PER_NIGHT = 200  // ¥/人/泊（実装前に確認）

export const DINNER_NONE = 'NONE'
export const DINNER_CANCEL = 'CANCEL'
export const DINNER_PENDING = 'PENDING'
export const DINNER_CLOCK_TIMES = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00'] as const

export const arrivalOptions = [...]    // 06:00〜22:00
export const rotenOptions = [...]      // 夕方16:00〜22:00 + 朝7:30〜9:30
export const breakfastOptions = [...]  // 7:30a〜9:30b
export const dinnerTimeOptions = [...]  // NONE/PENDING/時刻/CANCEL
export const lateCOOptions = [{ value: 1, label: 'あり' }, { value: 0, label: 'なし' }]
export const groupOptions = [...]
export const purposeOptions = [...]
export const tourismOptions = [...]
export const ageOptions = [...]
// countryOptions は world-countries から生成（優先国リスト含む）
```

既存 `src/constants/timetable.ts` の `ARRIVAL_TIME_VALUES` などと重複しないよう確認すること。

**マーケティング情報の選択肢一覧（`reference/v2/GuestInfo/reservationOptions.js` より）:**

```typescript
// グループ種別
export const groupOptions = [
  { value: '',             label: '不明'    },
  { value: 'couple',       label: 'カップル' },
  { value: 'married',      label: '夫婦'    },
  { value: 'parent_child', label: '親子'    },
  { value: 'friends',      label: '友達'    },
  { value: 'coworker',     label: '同僚'    },
  { value: 'other',        label: 'その他'  },
]

// 来訪目的
export const purposeOptions = [
  { value: '',         label: '不明'     },
  { value: 'tourism',  label: '観光'     },
  { value: 'business', label: 'ビジネス' },
]

// 観光種別（purpose === 'tourism' のとき表示）
export const tourismOptions = [
  { value: '',            label: '未選択'     },
  { value: 'normal',      label: '普通の観光' },
  { value: 'honeymoon',   label: 'ハネムーン' },
  { value: 'birthday',    label: '誕生日'     },
  { value: 'anniversary', label: '結婚記念日' },
]

// 年齢層（adult_count 人分、各人に1つ選択）
export const ageOptions = [
  { value: '',     label: '未選択' },
  { value: '~10',  label: '〜10歳' },
  { value: '10s',  label: '10代'   },
  { value: '20s',  label: '20代'   },
  { value: '30s',  label: '30代'   },
  { value: '40s',  label: '40代'   },
  { value: '50s',  label: '50代'   },
  { value: '60s',  label: '60代'   },
  { value: '70~',  label: '70代〜' },
]

// 国籍（world-countries から生成。優先表示国リスト）
const priorityCountryCodes = [
  'US','FR','JP','GB','IT','KR','CA','CN','DE','ES',
  'CH','AU','PL','RO','RU','AT','BE','DK','NZ','BR',
  'SG','NL','NO','SA','TW','MX','ZA','AR','FI','HK',
  'HR','ID','IE','IL','IN','LV','MY','PH','PT','SK','TH',
]
// TW は '台湾' に上書き（デフォルト「中華民国」）
// export const countryOptions = [{ value: '', label: '不明' }, ...prioritized, ...remaining]
```

---

### 新規 `src/types/guestInfo.ts`

```typescript
export type BookingSite = 'chillnn' | 'booking.com' | 'expedia' | 'other'

export type MailMemoEntry = {
  month: string   // "1"〜"12"
  day: string     // "1"〜"31"
  name: string
  summary: string
  text: string
  source: string  // 'booking' | 'expedia' | 'webmail'（booking_siteから自動設定）
}

export type NewReservationInput = {
  check_in_date: string   // YYYY-MM-DD（selectedDate）
  check_out_date: string  // YYYY-MM-DD
  room: RoomNumber
  adult_count: number
  child_count: number
  guest_name: string
  booking_site: BookingSite
  add_reason: string      // Slack通知にのみ使用、Firestoreには保存しない
}

// モーダルの保存ペイロード（check_out_date変更時は夜数連動フィールドも同時更新）
export type ReservationPatch = Partial<{
  check_out_date: string
  arrival_time: string | null
  late_out: number
  dinner_time: string[]
  dinner_info: string[]
  breakfast_time: (string | null)[]
  open_air_bath_time: (string | null)[]
  timetable_info: string[]
  mail_memo: MailMemoEntry[]
  a_tax_received: boolean
  a_tax_received_by_staff_name: string
  check_in_staff_name: string
  country: string
  city: string
  age_groups: string[]    // 長さ = adult_count（夜数とは独立）
  group_type: string
  purpose: string
  tourism_type: string
  profession: string
  other_note: string
}>
```

### `src/types/reservation.ts` に追加するフィールド

| フィールド | TypeScript型 | Zodスキーマ | 欠損/不正時 |
|---|---|---|---|
| `reservation_number` | `string` | `z.string().catch('').default('')` | `''` |
| `booking_site` | `BookingSite` | 下記参照 | `'other'` |
| `mail_memo` | `MailMemoEntry[]` | `z.array(MailMemoEntrySchema).catch([]).default([])` | `[]` |
| `a_tax_received` | `boolean` | `z.boolean().catch(false).default(false)` | `false` |
| `a_tax_received_by_staff_name` | `string` | `z.string().max(100).catch('').default('')` | `''` |
| `check_in_staff_name` | `string` | `z.string().max(100).catch('').default('')` | `''` |
| `country` | `string` | `z.string().max(100).catch('').default('')` | `''` |
| `city` | `string` | `z.string().max(100).catch('').default('')` | `''` |
| `age_groups` | `string[]` | `z.unknown().optional()` → normalizeArray(adult_count) | `[]` |
| `group_type` | `string` | `z.string().catch('').default('')` | `''` |
| `purpose` | `string` | `z.string().catch('').default('')` | `''` |
| `tourism_type` | `string` | `z.string().catch('').default('')` | `''` |
| `profession` | `string` | `z.string().catch('').default('')` | `''` |
| `other_note` | `string` | `z.string().catch('').default('')` | `''` |
| `dinner_info` | `string[]` | `z.unknown().optional()` → normalizeArray(nights) | `[]` |

`booking_site` の Zodスキーマ:
```typescript
const KNOWN_BOOKING_SITES = ['chillnn', 'booking.com', 'expedia'] as const

booking_site: z
  .string()
  .transform((v) => {
    const lower = v.toLowerCase()
    return (KNOWN_BOOKING_SITES as ReadonlyArray<string>).includes(lower) ? lower : 'other'
  })
  .catch('other')
  .default('other'),
```

`age_groups` の正規化（nights ではなく adult_count を使う）:
```typescript
age_groups: normalizeArray(parsed.age_groups, parsed.adult_count, isString, ''),
```

---

## 2. ユーザーフロー

### Step 1: E2E事前作成

AGENTS.mdの開発方針に従い、開発者とAI Agentの認識確認のために最初にE2Eテストを作成する。
既存の `e2e/` パターン（auth.setup.ts, storageState.json）を踏襲する。

#### `e2e/guestInfo.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

// 認証済みセッション前提（storageState利用）
test.use({ storageState: 'playwright/.auth/user.json' })

test.describe('GuestInfo - 予約一覧表示', () => {
  test('選択日のC/I予約カードが表示される', async ({ page }) => {
    await page.goto('/daily-dashboard')
    // 予約カード（room + guest_name）が存在することを確認
    await expect(page.getByTestId('reservation-card')).toBeVisible()
  })

  test('キャンセル予約が通常予約の下部に表示される', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await expect(page.getByTestId('cancelled-section')).toBeVisible()
  })
})

test.describe('GuestInfo - モーダル（auto-save）', () => {
  test('予約カードクリックでモーダルが開く', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('C/I前タブ: テキスト入力後にSavedインジケーターが表示される', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await page.getByTestId('reservation-card').first().click()
    await page.getByLabel('ゲスト名').fill('テスト太郎')
    // debounce後にSaved表示
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 3000 })
  })

  test('C/I後タブ: a_tax_received チェックボックスの変更が自動保存される', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await page.getByTestId('reservation-card').first().click()
    await page.getByRole('tab', { name: 'C/I後' }).click()
    await page.getByLabel('受領済み').click()
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 3000 })
  })

  test('モーダルを閉じて再度開いたとき変更が反映されている', async ({ page }) => {
    // flush + revalidate の確認
    await page.goto('/daily-dashboard')
    await page.getByTestId('reservation-card').first().click()
    await page.getByLabel('ゲスト名').fill('フラッシュ確認')
    await page.getByRole('button', { name: '閉じる' }).click()
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByLabel('ゲスト名')).toHaveValue('フラッシュ確認')
  })
})

test.describe('GuestInfo - キャンセル（非auto-save）', () => {
  test('キャンセルダイアログが2段階（確認 → 理由入力）で表示される', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await page.getByTestId('cancel-button').first().click()
    await expect(page.getByText('キャンセルしますか')).toBeVisible()
    await page.getByRole('button', { name: '続ける' }).click()
    await expect(page.getByLabel('キャンセル理由')).toBeVisible()
  })
})

test.describe('GuestInfo - 新規追加（非auto-save）', () => {
  test('＋カードクリックで追加ダイアログが開く', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('dialog', { name: '新規予約' })).toBeVisible()
  })

  test('必須項目未入力時は作成ボタンが無効', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('button', { name: '作成' })).toBeDisabled()
  })
})
```

#### `e2e/atax.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.use({ storageState: 'playwright/.auth/user.json' })

test.describe('ATaxTable - 表示', () => {
  test('ページが表示され予約行が存在する', async ({ page }) => {
    await page.goto('/a_tax_table')
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('月切り替えで表示が更新される', async ({ page }) => {
    await page.goto('/a_tax_table')
    await page.getByRole('button', { name: '先月' }).click()
    await expect(page.getByRole('table')).toBeVisible()
  })
})

test.describe('ATaxTable - チェックボックス（即時保存）', () => {
  test('受領済みチェックを切り替えると即時反映される', async ({ page }) => {
    await page.goto('/a_tax_table')
    const checkbox = page.getByRole('checkbox', { name: '受領済み' }).first()
    const before = await checkbox.isChecked()
    await checkbox.click()
    // リロード後も反映されていること
    await page.reload()
    const after = page.getByRole('checkbox', { name: '受領済み' }).first()
    await expect(after).toBeChecked({ checked: !before })
  })
})

test.describe('ATaxTable - CSV出力', () => {
  test('CSVダウンロードボタンが存在する', async ({ page }) => {
    await page.goto('/a_tax_table')
    await expect(page.getByRole('button', { name: /CSV/ })).toBeVisible()
  })
})
```

## 2. Domain層

### Step 2: domain unit test → 実装

#### `src/domain/reservation/bookingSitePolicy.test.ts`（先行）
- `isATaxExempt('chillnn')` → `true`
- `isATaxExempt('booking.com')` → `false`
- `isATaxExempt('expedia')` → `false`
- `isATaxExempt('other')` → `false`
- `calcATax(2, 3, 200)` → `1200`（2人 × 3泊 × ¥200）
- `calcATax(...)` Chillnnは呼び出し元でガードするためテスト不要

#### `src/domain/reservation/bookingSitePolicy.ts`
```typescript
import type { BookingSite } from '@/types/guestInfo'

export function isATaxExempt(bookingSite: BookingSite): boolean {
  return bookingSite === 'chillnn'
}

// Chillnn以外の予約の宿泊税計算（呼び出し元でisATaxExempt確認済み前提）
export function calcATax(adultCount: number, nights: number, ratePerPersonPerNight: number): number {
  return adultCount * nights * ratePerPersonPerNight
}
```

#### `src/domain/reservation/nightArrays.test.ts`（先行）
- 3泊 → 5泊: 末尾にデフォルト値追加
- 5泊 → 3泊: 末尾を削除
- 同泊数: そのまま

#### `src/domain/reservation/nightArrays.ts`
```typescript
export function resizeNightArray<T>(arr: T[], newNights: number, defaultValue: T): T[] {
  if (arr.length === newNights) return arr
  if (arr.length > newNights) return arr.slice(0, newNights)
  return [...arr, ...Array(newNights - arr.length).fill(defaultValue)]
}

// check_out_date変更時にまとめてリサイズ
export function resizeNightFields(
  fields: Pick<ReservationPatch, 'dinner_time' | 'dinner_info' | 'breakfast_time' | 'open_air_bath_time' | 'timetable_info'>,
  newNights: number,
) {
  return {
    dinner_time:        resizeNightArray(fields.dinner_time ?? [], newNights, 'NONE'),
    dinner_info:        resizeNightArray(fields.dinner_info ?? [], newNights, ''),
    breakfast_time:     resizeNightArray(fields.breakfast_time ?? [], newNights, null),
    open_air_bath_time: resizeNightArray(fields.open_air_bath_time ?? [], newNights, null),
    timetable_info:     resizeNightArray(fields.timetable_info ?? [], newNights, ''),
  }
}
```

---

## 3. Infra層

### `src/constants/guestInfo.ts`（新規）
```typescript
// 宿泊税レート（実装前に実際の金額を確認すること）
export const A_TAX_RATE_PER_PERSON_PER_NIGHT = 200  // ¥/人/泊
```

### `src/domain/ports/reservationRepository.ts`（メソッド追加）
```typescript
export interface ReservationRepository {
  fetchByDateRange(from: string, to: string): Promise<Reservation[]>
  fetchByMonth(year: number, month: number): Promise<Reservation[]>
  cancelReservation(id: string, mailMemoEntry: MailMemoEntry): Promise<void>
  restoreReservation(id: string, mailMemoEntry: MailMemoEntry): Promise<void>
  addReservation(input: NewReservationInput): Promise<string>  // returns doc id
  updateReservation(id: string, patch: ReservationPatch): Promise<void>
  updateATaxReceived(id: string, received: boolean, staffName: string): Promise<void>
}
```

### `src/infra/reservation/firestoreReservationRepository.ts`（更新）

1. `FirestoreReservationSchema` に全新フィールドを追加
2. `toReservation()` の return に全フィールドを追加
3. 書き込みメソッドを追加:

```typescript
// キャンセル
async cancelReservation(id, mailMemoEntry) {
  await adminDb.collection('guestInfoV2').doc(id).update({
    cancel: 1,
    mail_memo: FieldValue.arrayUnion(mailMemoEntry),
  })
}
// 復活
async restoreReservation(id, mailMemoEntry) {
  await adminDb.collection('guestInfoV2').doc(id).update({
    cancel: 0,
    mail_memo: FieldValue.arrayUnion(mailMemoEntry),
  })
}
// 手動追加
async addReservation(input) {
  const id = uuidv7()
  await adminDb.collection('guestInfoV2').add({
    reservation_number: id,
    check_in_date: toFirestoreDate(input.check_in_date),
    check_out_date: toFirestoreDate(input.check_out_date),
    room: input.room,
    adult_count: input.adult_count,
    child_count: input.child_count,
    guest_name: input.guest_name,
    booking_site: input.booking_site,
    cancel: 0,
    source: 'manual',
    mail_memo: [],
  })
  return id  // reservation_number と同値
}
// モーダル保存
async updateReservation(id, patch) {
  if (Object.keys(patch).length === 0) return
  await adminDb.collection('guestInfoV2').doc(id).update(patch)
}
// ATaxTable のチェックボックス更新
async updateATaxReceived(id, received, staffName) {
  await adminDb.collection('guestInfoV2').doc(id).update({
    a_tax_received: received,
    a_tax_received_by_staff_name: staffName,
  })
}
// 月別取得（a_tax_table用）
async fetchByMonth(year, month) {
  const from = `${year}/${String(month).padStart(2, '0')}/01`
  const nextMonth = month === 12 ? `${year + 1}/01/01` : `${year}/${String(month + 1).padStart(2, '0')}/01`
  const snapshot = await adminDb
    .collection('guestInfoV2')
    .where('check_in_date', '>=', from)
    .where('check_in_date', '<', nextMonth)
    .get()
  return snapshot.docs.map((doc) => toReservation(doc.id, doc.data()))
}
```

---

## 4. Application層

### `src/application/guestInfo/getGuestInfoUseCase.ts`
```typescript
export type GuestInfoData = {
  normal: Reservation[]    // cancel !== 1 かつ check_in_date === targetDate
  cancelled: Reservation[] // cancel === 1 かつ check_in_date === targetDate
}
// fetchByDateRange(targetDate, targetDate) で取得して分離
```

### Commands
- **`cancelReservationCommand.ts`**: mail_memo entry構築 → cancelReservation → Slack通知
- **`restoreReservationCommand.ts`**: mail_memo entry構築 → restoreReservation → Slack通知
- **`addReservationCommand.ts`**: addReservation → Slack通知（add_reasonをSlackのみに使用）
- **`updateReservationCommand.ts`**: updateReservation（単純委譲）

**mail_memo entry構築ルール:**
```typescript
// キャンセル時
{ month, day, name: guest_name, summary: 'キャンセル', text: reason, source: 'システム' }
// 復活時
{ month, day, name: guest_name, summary: 'キャンセル復活', text: reason, source: 'システム' }
```

**Slackメッセージ形式:**
```
[キャンセル] {reservation_number} - 理由: {reason}
[予約復活]   {reservation_number} - 理由: {reason}
[手動追加]   {reservation_number} - 理由: {add_reason}
```

### `src/application/aTaxTable/getATaxTableUseCase.ts`
```typescript
// fetchByMonth → isATaxExempt / calcATax で各行の税額を計算して返す
// Firestoreにtaxは保存しないため、表示時に毎回計算
```

---

## 5. API Routes

| メソッド | パス | 概要 |
|---|---|---|
| `GET` | `/api/guest-info?date=YYYY-MM-DD` | 選択日のguestInfo |
| `PATCH` | `/api/reservations/[id]/cancel` | `{ reason: string }` |
| `PATCH` | `/api/reservations/[id]/restore` | `{ reason: string }` |
| `POST` | `/api/reservations` | `NewReservationInput` |
| `PATCH` | `/api/reservations/[id]` | `ReservationPatch` |
| `GET` | `/api/a-tax-table?year=YYYY&month=M` | ATaxTable用 |
| `PATCH` | `/api/reservations/[id]/a-tax` | `{ received: boolean; staffName: string }` |

全Route Handlerは既存パターンに準拠:
1. verifySession → 401
2. Zod safeParse → 400
3. Command/UseCase呼び出し
4. InfraError → infraErrorToStatus + Slack通知（UNAVAILABLE/PERMISSION/想定外）

**Integration tests（各routeに対応）:**
```
src/app/api/guest-info/route.test.ts
src/app/api/reservations/[id]/cancel/route.test.ts
src/app/api/reservations/[id]/restore/route.test.ts
src/app/api/reservations/route.test.ts
src/app/api/reservations/[id]/route.test.ts
src/app/api/a-tax-table/route.test.ts
src/app/api/reservations/[id]/a-tax/route.test.ts
```

---

## 6. Hooks

| ファイル | 戻り値 | 備考 |
|---|---|---|
| `hooks/guestInfo/useGuestInfo.ts` | `{ data, isLoading, error }` | useCleaningBoardパターン踏襲 |
| `hooks/guestInfo/useCancelReservation.ts` | `{ execute, isPending, error }` | 明示的アクション（非auto-save） |
| `hooks/guestInfo/useRestoreReservation.ts` | `{ execute, isPending, error }` | 明示的アクション（非auto-save） |
| `hooks/guestInfo/useAddReservation.ts` | `{ execute, isPending, error }` | 明示的アクション（非auto-save） |
| `hooks/guestInfo/useUpdateReservation.ts` | `{ execute, isPending, error }` | auto-save内部で使用 |
| `hooks/aTaxTable/useATaxTable.ts` | `{ data, isLoading, error }` | |
| `hooks/aTaxTable/useUpdateATaxReceived.ts` | `{ execute, isPending, error }` | a_tax_tableのチェックボックス（auto-save） |

---

## 7. UI — daily-dashboard

### 7-1. 印刷ボタン移動（`DailyDashboard.tsx`）

- 既存の `variant="contained"` ボタン2つを削除
- 日付ナビゲーション行の右端に `Tooltip` + `IconButton`（`PrintIcon`）として配置

### 7-2. GuestInfoセクション（`DailyDashboard.tsx` に追加）

```
src/components/guestInfo/
├── GuestInfoSection.tsx         # 全体コンテナ（useGuestInfo + カード群）
├── ReservationListCard.tsx      # 120×120カード（room + guest_name、キャンセルボタン）
├── AddReservationCard.tsx       # ＋カード
├── CancelledSection.tsx         # キャンセル予約の下部エリア（常時表示・折り畳みなし）
│
├── ReservationModal.tsx         # 2タブモーダル（C/I前・C/I後）
│   │  ヘッダー: room / guest_name（左）、タブ（中央）、閉じるボタン（右）
│   │  高さ固定（600px）、保存ボタンなし（auto saving）
│   │
│   ├── CardSet1/                # C/I前タブ（左右2カラム）
│   │   ├── ReservationCardSet1.tsx    # レイアウト管理（左3/4 + 右1/4）
│   │   ├── ReservationEditorList.tsx  # 左：フィールド編集リスト
│   │   │     guest_name, room, adult/child_count
│   │   │     check_out_date（変更→resizeNightFields呼び出し）
│   │   │     arrival_time, open_air_bath_time[], dinner_time[]+dinner_info[]
│   │   │     breakfast_time[], late_out, timetable_info[]
│   │   └── MailMemo.tsx               # 右：メールメモ（タイムライン形式）
│   │
│   └── CardSet2/                # C/I後タブ
│       └── ReservationCardSet2.tsx
│             TaxSection: a_tax_received, a_tax_received_by_staff_name
│                         税額表示（isATaxExempt → calcATax で計算）
│             MarketingSection: check_in_staff_name, country, city
│                               age_groups[], group_type, purpose
│                               tourism_type, profession, other_note
│
├── AddReservationDialog.tsx     # 新規追加フォーム（必須項目のみ）
├── CancelDialog.tsx             # キャンセル確認（2段階: confirm → reason入力）
└── RestoreDialog.tsx            # 復活確認（reason入力）
```

**auto-save 対象 / 非対象の区別:**

| 操作 | 方式 | 理由 |
|---|---|---|
| モーダル内フィールド編集（C/I前・C/I後タブ全て） | auto-save | UX優先 |
| a_tax_received チェックボックス（モーダル内） | auto-save | 同上 |
| a_tax_table のチェックボックス | 即時保存（debounce 0ms） | 確定操作なので待つ必要なし |
| キャンセル | 明示的ボタン + CancelDialog | 取り消し不可操作 |
| キャンセル復活 | 明示的ボタン + RestoreDialog | 取り消し不可操作 |
| 新規予約追加 | 明示的ボタン + AddReservationDialog | 作成確定操作 |

**モーダルのフォーム状態管理（ReservationModal.tsx）:**

v2 `GuestInfoEditable.jsx` のパターンをTypeScript化して踏襲する:

```typescript
// pendingPayloadRef にフィールド変更を蓄積し、debounce(500ms)でまとめて送信
const pendingPayloadRef = useRef<ReservationPatch>({})

const debouncedUpdate = useRef(
  debounce((id: string) => {
    const payload = pendingPayloadRef.current
    pendingPayloadRef.current = {}
    useUpdateReservation.execute(id, payload)
  }, 500)
).current

// フィールド変更時
const handleFieldChange = (field: keyof ReservationPatch, value: unknown) => {
  // check_out_date 変更時は resizeNightFields を呼んで夜数連動フィールドを更新
  pendingPayloadRef.current = { ...pendingPayloadRef.current, [field]: value }
  debouncedUpdate(reservation.id)
  setLocalData(prev => ({ ...prev, [field]: value }))  // 楽観的UI更新
}

// モーダルclose時・別予約選択時 → flush
const flushPending = () => {
  if (Object.keys(pendingPayloadRef.current).length > 0) debouncedUpdate.flush()
  else debouncedUpdate.cancel()
}
```

- `setLocalData` で即時UI更新（楽観的）、実際の保存はdebounce後
- セレクト/チェックボックスはdebounce 0ms（即時flush）でもよい
- 保存状態インジケーター（`idle` / `saving` / `saved` / `error`）をモーダルヘッダーに表示
- モーダルclose時・日付切り替え時（useEffect cleanup）に `flushPending()` 呼び出し

---

## 8. /a_tax_table ページ

```
src/app/a_tax_table/page.tsx
src/components/aTaxTable/
├── ATaxTable.tsx          # 月切り替え + テーブル + CSVボタン + 残高表示
├── MonthSelector.tsx      # 先月/今月切り替え
├── ReservationTable.tsx   # DataGrid（tax列は calcATax で計算して表示）
└── BalanceDisplay.tsx     # 合計表示
```

**v2との差分（必ず対応）:**
- `tax` 列: Firestoreの値ではなく `calcATax(adult_count, nights, A_TAX_RATE)` で計算
- `booking_site` の比較: `isATaxExempt(booking_site)`（infra正規化済みのため大文字不要）
- `safeBalanceChecker`: `daily/{YYYY-MM-DD}.safeBalanceChecker` から取得

---

## 実装順序

AGENTS.md の方針: **E2E → domain unit test → domain → infra → application → hooks → integration test → UI**

```
【準備】
1.  パッケージ確認・追加（uuid, world-countries）
2.  public/icons/ にアイコンをコピー（reference/v2/assets/icons/*.png）

【E2E（最初に作成 → 実装後に通す）】
3.  e2e/guestInfo.spec.ts（上記プランの具体的テストコードで作成）
4.  e2e/atax.spec.ts（上記プランの具体的テストコードで作成）

【型・定数】
5.  src/constants/guestInfo.ts（A_TAX_RATE + 全選択肢 + DINNER定数を一元化）
    ※ src/constants/timetable.ts との重複確認・統合
6.  src/types/guestInfo.ts（新規: BookingSite, MailMemoEntry, NewReservationInput, ReservationPatch）
7.  src/types/reservation.ts（フィールド追加: 14フィールド）

【Domain】
8.  domain unit test → src/domain/reservation/bookingSitePolicy.ts
9.  domain unit test → src/domain/reservation/nightArrays.ts
10. src/domain/ports/reservationRepository.ts（メソッド追加: 6本）

【Infra】
11. src/infra/reservation/firestoreReservationRepository.ts
    - FirestoreReservationSchema に新フィールド追加
    - toReservation() に新フィールド追加
    - 書き込みメソッド追加（cancel/restore/add/update/updateATaxReceived/fetchByMonth）

【Application】
12. src/application/guestInfo/getGuestInfoUseCase.ts
13. src/application/guestInfo/cancelReservationCommand.ts
14. src/application/guestInfo/restoreReservationCommand.ts
15. src/application/guestInfo/addReservationCommand.ts
16. src/application/guestInfo/updateReservationCommand.ts
17. src/application/aTaxTable/getATaxTableUseCase.ts

【API Routes + Integration Tests】
18. GET  /api/guest-info + route.test.ts
19. POST /api/reservations + route.test.ts
20. PATCH /api/reservations/[id] + route.test.ts          ← auto-save
21. PATCH /api/reservations/[id]/cancel + route.test.ts
22. PATCH /api/reservations/[id]/restore + route.test.ts
23. GET  /api/a-tax-table + route.test.ts
24. PATCH /api/reservations/[id]/a-tax + route.test.ts

【Hooks】
25. hooks/guestInfo/useGuestInfo.ts
26. hooks/guestInfo/useUpdateReservation.ts               ← auto-save用
27. hooks/guestInfo/useCancelReservation.ts
28. hooks/guestInfo/useRestoreReservation.ts
29. hooks/guestInfo/useAddReservation.ts
30. hooks/aTaxTable/useATaxTable.ts
31. hooks/aTaxTable/useUpdateATaxReceived.ts

【UI — daily-dashboard】
32. DailyDashboard.tsx: 印刷ボタンをIconButtonに移動
33. GuestInfoSection.tsx + ReservationListCard.tsx + AddReservationCard.tsx
34. CancelledSection.tsx
35. ReservationModal.tsx（2タブ骨格 + pendingPayloadRef auto-save）
36. CardSet1: ReservationCardSet1.tsx + ReservationEditorList.tsx + MailMemo.tsx
37. CardSet2: ReservationCardSet2.tsx（TaxSection + MarketingSection）
38. AddReservationDialog.tsx
39. CancelDialog.tsx + RestoreDialog.tsx

【UI — /a_tax_table】
40. src/app/a_tax_table/page.tsx
41. ATaxTable.tsx + MonthSelector.tsx + ReservationTable.tsx + BalanceDisplay.tsx

【UI・UX ブラッシュアップ】

# A. バグ修正（最優先）
42. MailMemo.tsx: メールメモのテキスト編集時にエラーが発生するバグを修正

# B. /a_tax_table 修正
43. MonthSelector.tsx: 月表示からyear（年）を削除し月のみ表示にする
44. ATaxTable.tsx: filterスイッチを削除（常に全件表示）

# C. GuestInfoSection / カード表示
45. GuestInfoSection.tsx: 部屋番号が若い順（昇順）にカードを左から並べる
46. GuestInfoSection.tsx: ローディング中スピナーをページ中央表示に変更
47. GuestInfoSection.tsx: キャンセル成功・新規追加成功時に右下 Snackbar で通知（"キャンセルしました" / "予約を追加しました"）
48. CancelledSection.tsx + ReservationListCard.tsx:
    - キャンセル済みカードを通常カードの半分サイズ（60×60px）で表示
    - room を非表示、guest_name と復帰アイコンのみ表示
    - 復帰アイコンを UpgradeIcon（`@mui/icons-material/Upgrade`）に変更
49. ReservationListCard.tsx + AddReservationCard.tsx:
    - キャンセルボタン・復帰ボタン・追加カードに Tooltip を追加し、ホバー時にアクション説明を表示
      - キャンセルボタン: "キャンセル"
      - 復帰ボタン: "キャンセル復帰"
      - 追加カード: "新規予約追加"

# D. ダイアログ改善
50. CancelDialog.tsx: 確認ステップ（"はい/戻る"）を廃止し、ダイアログ表示直後からキャンセル理由入力画面を表示
51. AddReservationDialog.tsx:
    - フィールドレイアウトを2列グリッドに変更（追加理由のみ全幅・最下部）
    - C/O日入力を DatePicker（カレンダーアイコン+カレンダー選択）に変更

# E. ReservationModal 改善
52. ReservationModal.tsx:
    - ヘッダー縦幅を縮小（minHeight 48→32px 相当）
    - バツアイコンを大きく表示・クリック/ホバー範囲を拡大（padding 増加）
    - room 表示を太字でなく guest_name と同スタイルに変更
    - C/I前・後タブにホバースタイルを追加
53. ReservationModal.tsx + useUpdateReservation.ts:
    - 保存失敗時のエラーを右下 Snackbar で表示（一定時間後に自動で消える）
    - ヘッダー内の既存エラーテキスト表示を削除
54. ReservationModal.tsx: テキスト入力中のタイピング体験改善
    - TextField の onChange でdebounceをリセットしない（入力中は保存しない）
    - 代わりに onBlur でも即時 flush する（フォーカスを外した瞬間に保存）

# F. CardSet1（C/I前タブ）改善
55. ReservationCardSet1.tsx: 左カラム幅を 30%→20% に縮小し右カラム（メールログ）を拡大
56. ReservationEditorList.tsx:
    - 展開フィールドのフォントサイズ・padding をより小さく（現 size="small" → さらにコンパクトに）
    - timetable_info の TextField の minRows を 3 に変更
    - room セレクトの未選択時ラベルを "未アサイン" に変更
    - open_air_bath_time の未定ラベルを "未定" に変更（現状確認・修正）
    - breakfast_time の未定ラベルを "未定" に変更（現状確認・修正）

# G. CardSet2（C/I後タブ）改善
57. ReservationCardSet2.tsx:
    - マーケティング情報エリアのスクロールバーを白／透明に変更
    - 宿泊税セクションの "（免除）" テキスト表示を削除
    - a_tax_received_by_staff_name と check_in_staff_name のフィールドを
      v2（ReservationCardSet2.sections.jsx）と同様の記入 UX に変更
      （TextField を直接フォーム内に配置せずインライン編集スタイルに）
    - マーケティング情報の各フィールドを3列グリッドに整列
      （minWidth を統一し、その他 other_note はグリッド2列分の幅に変更）
x. a_tax_table ui: a_tax_tableのC/I日の横幅を少し広くしたい。各項目の値は横は中央寄せで表示。スタッフ名項目の横幅はそれぞれ少し小さくしたい。
x. loadingスピナーは横中央に表示されているが縦は少し上川に表示されている。画面の"中心"に表示したい。
x. キャンセル->キャンセルする、新規追加->新規追加する, キャンセル復帰->キャンセル復帰する と表示を変えたい。
x. キャンセル復帰成功しても再レンダリングされるので成功しましたの表示はできなそう(新規追加やキャンセル化も同様)
x. 新規追加フィールドUI："C/O 日", "部屋" ラベルが"新規予約追加（C/I: 2025-04-29）"のヘッダーに被っていて一部表示されてないのでpaddingみたいにして大きめの間を空けたい。また、表示順はC/O日->ゲスト名->大人人数->子供人数->部屋->予約サイト->追加理由(改行可能だがdefaultで1行表示)
x. - バツアイコンを大きく表示・クリック/ホバー範囲を拡大（padding 増加）ー＞もっと大きく
x. C/I前・後タブにホバースタイルを追加->現在のやつではなくMUItoggleButtonにしてUI/UXを改善したい。

【後処理】
58. e2e/guestInfo.spec.ts, e2e/atax.spec.ts が通るか確認
59. docs/Schema/Reservations.md に新フィールドを追記
60. npm run lint && npx vitest run && npm run build で最終確認
61. GuestInfo.md と GuestInfoPlan.md を削除（実装後は内容が乖離するため後で作り直す）
62. Review.md に沿ってコードレビュー
```

## Review.md 対応チェックリスト（計画段階で考慮済み）

### boundary value（[], null, 0, ""）
| ケース | 対応 |
|---|---|
| `nights = 0`（C/I = C/O） | Zodスキーマ: `check_out_date > check_in_date` で弾く。新規追加APIでも同様に検証 |
| `adult_count = 0` | 新規追加フォーム: Zodで `min(1)` を設定 |
| `reservation_number = ''` | 旧データ対応。Slackメッセージでは空の場合 `'(番号なし)'` を代替表示 |
| `mail_memo = []` | infra: `.catch([]).default([])` で保証 |
| `age_groups` が adult_count と不一致 | normalizeArray(adult_count) で常に補正 |
| `resizeNightArray` に nights=0 | `Array(0).fill(x)` = `[]`、問題なし |
| フォーム送信時のフィールド未入力 | APIのZodスキーマで required を明示、400返却 |

### セキュリティ
- 全APIに `verifySession` → 未認証401
- 全入力にZod `safeParse` → 不正400
- Slack通知メッセージに個人情報を含めない（`reservation_number` のみ）
- Firestoreの直接クライアントアクセスなし（全てRoute Handler経由）
- `add_reason` は Slack 送信のみ、Firestoreには保存しない

### UI（error / loading状態）
- 各hookは `{ data, isLoading, error: string | null }` を返す
- 書き込みhookは `{ execute, isPending, error: string | null }` を返す
- モーダルの保存中は `Saving...` インジケーターをヘッダーに表示（保存ボタンなし）
- ダイアログのエラーはダイアログ内にインライン表示（Alertコンポーネント）
- GuestInfoSection のエラー/ローディングはdaily-dashboard内に表示

### アーキテクチャ
- `world-countries` は constants 層でのみ使用（コンポーネント層に直接import不可）
- アイコン（`reference/v2/assets/icons/*.png`）は `public/icons/` にコピーして使用
- dinner定数は既存 `src/infra/reservoir/...` の `DINNER_TIME_VALUES` と統合すること（重複排除）
- `countryOptions` は `world-countries` 依存のため、コンポーネントで `useMemo` 不要（定数のまま export）

### エラーハンドリング
- 全書き込みAPIは `InfraError → infraErrorToStatus + Slack通知` パターンを踏襲
- キャンセル/復活/追加のSlack通知失敗は `fire-and-forget`（メイン処理を止めない）
- ATaxTableのcheckbox更新失敗はUIにエラー表示（Snackbar or Alert）

### docs との整合
- `docs/Schema/Reservations.md` に新フィールド全てを追記すること（実装後）

---

## 検証

```bash
npm run lint
npx vitest run src/domain/
npx vitest run src/app/api/
npm run build
```
