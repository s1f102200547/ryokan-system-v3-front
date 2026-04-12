import { test, expect, type Page } from '@playwright/test'

/**
 * API レスポンス型（STEP 3/4 で正式定義予定）
 * v2 の arrivalDict / stayStatus と同じ dict 形式を踏襲する。
 *
 * checkInSlots  : 到着時刻 → ラベル配列 (例: { '15:00': ['㉑田中太郎-2(1/2泊目)'] })
 * guestInfoRows : 部屋番号 → 在泊テキスト (例: { '21': 'memo', '22': '空室' })
 * checkoutRooms : CheckoutNotice に表示する部屋マーク配列（翌日COの部屋）
 * lateCheckoutRooms : 翌日レイトアウトの部屋マーク配列
 */
type TimetableData = {
  checkInSlots: Record<string, string[]>
  stayingGuestLabels: string[]           // 日付-arrival間: 2泊以上のゲスト横並び表示
  eveningBathSlots: Record<string, string[]>
  dinnerSlots: Record<string, string[]>
  guestInfoRows: Record<string, string>
  breakfastSlots: Record<string, string[]>
  checkoutRooms: string[]
  morningBathSlots: Record<string, string[]>
  lateCheckoutRooms: string[]
}

const ROOMS = ['21', '22', '31', '32', '42', '43', '61'] as const

function allVacantInfo(): Record<string, string> {
  return Object.fromEntries(ROOMS.map((r) => [r, '空室']))
}

/**
 * 2026-04-12 (日): room 21 がチェックイン（2泊 → CO: 4/14、late_out: 1）
 *   arrival: 15:00 / open_air_bath: 16:00 / dinner: 17:30 / breakfast: 8:00a
 *   timetable_info: 'memo'
 *   ラベル形式: {部屋マーク}{宿泊者名}-{大人数}({子供数})
 *     → 子供0人なので ㉑田中太郎-2（括弧なし）
 */
function mockFor0412(): TimetableData {
  return {
    checkInSlots: { '15:00': ['㉑田中太郎-2'] },
    stayingGuestLabels: ['㉑-2(1/2泊目)'],
    eveningBathSlots: { '16:00': ['㉑'] },
    dinnerSlots: { '17:30': ['㉑田中太郎-2'] },
    guestInfoRows: { ...allVacantInfo(), '21': 'memo' },
    breakfastSlots: { '8:00a': ['㉑'] },
    checkoutRooms: [],
    morningBathSlots: {},
    lateCheckoutRooms: [],
  }
}

/**
 * 2026-04-13 (月): room 21 は連泊中（2泊目、CO: 4/14、late_out: 1）
 *   checkoutRooms: 翌日(4/14)にCO → ㉑ を表示
 *   lateCheckoutRooms: 翌日COがレイトアウト → ㉑ を表示
 */
function mockFor0413(): TimetableData {
  return {
    checkInSlots: {},
    stayingGuestLabels: ['㉑-2(2/2泊目)'],
    eveningBathSlots: {},
    dinnerSlots: {},
    guestInfoRows: { ...allVacantInfo(), '21': '' },
    breakfastSlots: {},
    checkoutRooms: ['㉑'],
    morningBathSlots: {},
    lateCheckoutRooms: ['㉑'],
  }
}

// ---------------------------------------------------------------------------
// ヘルパー: Date を 2026-04-12T12:00:00 JST に固定する（page.goto 前に呼ぶ）
// ---------------------------------------------------------------------------
async function fixDateTo0412(page: Page) {
  await page.addInitScript(() => {
    const FIXED = new Date('2026-04-12T12:00:00+09:00').getTime()
    const RD = globalThis.Date
    class MockDate extends RD {
      constructor(...args: ConstructorParameters<typeof Date>) {
        // @ts-expect-error spread into Date constructor
        super(...(args.length === 0 ? [FIXED] : args))
      }
      static now() { return FIXED }
      static parse(s: string) { return RD.parse(s) }
      static UTC(...args: Parameters<typeof Date.UTC>) { return RD.UTC(...args) }
    }
    // @ts-expect-error replace global Date
    globalThis.Date = MockDate
  })
}

// ---------------------------------------------------------------------------

test.describe('タイムテーブル', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.TEST_EMAIL
    const password = process.env.TEST_PASSWORD
    if (!email || !password) test.skip()

    await fixDateTo0412(page)

    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill(email!)
    await page.getByLabel('パスワード').fill(password!)
    await page.getByRole('button', { name: 'ログイン' }).click()
    await page.waitForURL('/')
  })

  // ── 常に表示されるもの ──────────────────────────────────────────────────

  test('日付が 4/12 (日) と表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    // 2026-04-12 は日曜日
    await expect(page.getByTestId('timetable-date')).toContainText('4/12')
    await expect(page.getByTestId('timetable-date')).toContainText('日')
  })

  test('曜日チェック欄に ▢ニゴウ情報送信 と ▢61布団 が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    // 日曜は ▢資源ごみ も追加される
    await expect(page.getByTestId('weekday-checks')).toContainText('▢ニゴウ情報送信')
    await expect(page.getByTestId('weekday-checks')).toContainText('▢61布団')
    await expect(page.getByTestId('weekday-checks')).toContainText('▢資源ごみ')
  })

  test('印刷ボタンが表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    await expect(page.getByRole('button', { name: '印刷' })).toBeVisible()
  })

  // ── 4/12 連泊ゲスト表示（日付-arrival間） ──────────────────────────────

  test('StayingGuests: 日付-arrival間に ㉑-2(1/2泊目) が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    // 2泊以上のゲストを横並び表示: {部屋マーク}-{大人数}[({子供数})]({現在泊目}/{全泊数}泊目)
    await expect(page.getByTestId('staying-guests')).toContainText('㉑')
    await expect(page.getByTestId('staying-guests')).toContainText('-2')
    await expect(page.getByTestId('staying-guests')).toContainText('1/2泊目')
  })

  // ── 4/12 チェックイン ───────────────────────────────────────────────────

  test('CheckIn: 15:00 の枠に ㉑、田中太郎、-2 が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    // ラベル形式: {部屋マーク}{宿泊者名}-{大人数} → ㉑田中太郎-2
    await expect(page.getByTestId('checkin-slot-15:00')).toContainText('㉑')
    await expect(page.getByTestId('checkin-slot-15:00')).toContainText('田中太郎')
    await expect(page.getByTestId('checkin-slot-15:00')).toContainText('-2')
  })

  // ── 4/12 夕方露天風呂 ───────────────────────────────────────────────────

  test('EveningBath: 16:00 の枠に ㉑ が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    await expect(page.getByTestId('evening-bath-slot-16:00')).toContainText('㉑')
  })

  // ── 4/12 夕食 ──────────────────────────────────────────────────────────

  test('Dinner: 17:30 の枠に ㉑、田中太郎、-2 が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    // ラベル形式: {部屋マーク}{宿泊者名}-{大人数} → ㉑田中太郎-2
    await expect(page.getByTestId('dinner-slot-17:30')).toContainText('㉑')
    await expect(page.getByTestId('dinner-slot-17:30')).toContainText('田中太郎')
    await expect(page.getByTestId('dinner-slot-17:30')).toContainText('-2')
  })

  // ── 4/12 在泊情報 ──────────────────────────────────────────────────────

  test('GuestInfo: room 21 に memo が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    await expect(page.getByTestId('guest-info-row-21')).toContainText('memo')
  })

  test('GuestInfo: room 21 以外の 6 部屋が「空室」と表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    // 7部屋中 room 21（memo 表示）以外の 6 部屋が空室
    await expect(page.getByTestId('guest-info-vacant')).toHaveCount(6)
  })

  // ── 4/12 朝食（翌朝分） ────────────────────────────────────────────────

  test('Breakfast: 8:00a の枠に ㉑ が表示される', async ({ page }) => {
    await page.route('/api/timetable*', (route) => route.fulfill({ json: mockFor0412() }))
    await page.goto('/timetable')

    await expect(page.getByTestId('breakfast-slot-8:00a')).toContainText('㉑')
  })

  // ── 翌日(4/13)ページの表示 ─────────────────────────────────────────────

  test('4/13 ページの CheckoutNotice に ㉑ が表示される', async ({ page }) => {
    await page.route('/api/timetable*', async (route) => {
      const url = new URL(route.request().url())
      const date = url.searchParams.get('date')
      route.fulfill({ json: date === '2026-04-13' ? mockFor0413() : mockFor0412() })
    })
    await page.goto('/timetable')

    // 日付を 4/13 に移動（page は ?date= クエリを受け付ける想定）
    await page.goto('/timetable?date=2026-04-13')

    await expect(page.getByTestId('checkout-notice')).toContainText('㉑')
  })

  test('4/13 ページの LateCheckout に ㉑ が表示される', async ({ page }) => {
    await page.route('/api/timetable*', async (route) => {
      const url = new URL(route.request().url())
      const date = url.searchParams.get('date')
      route.fulfill({ json: date === '2026-04-13' ? mockFor0413() : mockFor0412() })
    })
    await page.goto('/timetable?date=2026-04-13')

    // room 21 は CO: 4/14 かつ late_out=1 → 4/13 ページのレイトアウト欄に表示
    await expect(page.getByTestId('late-checkout-notice')).toContainText('㉑')
  })
})
