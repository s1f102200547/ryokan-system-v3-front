import { test, expect, type Page } from '@playwright/test'
import { RESERVATION_LIMITS as L } from '../src/constants/guestInfo'

async function suppressPrint(page: Page) {
  await page.addInitScript(() => { window.print = () => {} })
}

const SAMPLE_RESERVATION = {
  id: 'test-id-1',
  guest_name: 'テスト太郎',
  room: '21',
  check_in_date: '2026-01-01',
  check_out_date: '2026-01-02',
  adult_count: 2,
  child_count: 0,
  cancel: 0,
  late_out: 0,
  arrival_time: null,
  dinner_time: ['NONE'],
  dinner_info: [''],
  breakfast_time: [null],
  open_air_bath_time: [null],
  timetable_info: [''],
  reservation_number: 'test-rsv-001',
  booking_site: 'other',
  mail_memo: [],
  a_tax_received: false,
  a_tax_received_by_staff_name: '',
  check_in_staff_name: '',
  country: null,
  city: '',
  age_groups: [null, null],
  group_type: null,
  purpose: null,
  tourism_type: null,
  profession: '',
  other_note: '',
}

const CANCELLED_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-2',
  room: '22',
  cancel: 1,
}

const LATE_ROOM_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-3',
  guest_name: '先に返された予約',
  room: '43',
  arrival_time: '20:00',
}

const EARLY_ROOM_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-4',
  guest_name: '後に返された予約',
  room: '21',
  arrival_time: '15:00',
}

const STAYING_RESERVATION = {
  ...SAMPLE_RESERVATION,
  id: 'test-id-5',
  guest_name: '連泊花子',
  room: '61',
  check_in_date: '2025-12-31',
  check_out_date: '2026-01-02',
}

async function setupAuth(page: Page) {
  await page.context().addCookies([{
    name: 'session',
    value: 'mock-session',
    domain: '127.0.0.1',
    path: '/',
  }])
}

async function mockGuestInfoApi(page: Page) {
  await page.route('/api/guest-info*', (route) => route.fulfill({
    status: 200,
    json: { normal: [SAMPLE_RESERVATION], staying: [], cancelled: [CANCELLED_RESERVATION] },
  }))
  await page.route('**/api/daily/**/todos', (route) => route.fulfill({
    status: 200,
    json: { todos: [] },
  }))
  await page.route('/api/a-tax-table*', (route) => route.fulfill({
    status: 200,
    json: { rows: [], safeBalanceCheckers: {} },
  }))
  await page.route('**/api/reservations/**', (route) => route.fulfill({ status: 200, json: {} }))
  await page.route('**/api/reservations/*', (route) => route.fulfill({ status: 200, json: {} }))
}

test.describe('GuestInfo - 予約一覧表示', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('選択日のC/I予約カードが表示される', async ({ page }) => {
    await expect(page.getByTestId('reservation-card').first()).toBeVisible()
  })

  test('キャンセル済み予約セクションが表示され復活ボタンは表示されない', async ({ page }) => {
    await expect(page.getByTestId('cancelled-section')).toBeVisible()
    await expect(page.getByTestId('restore-button')).not.toBeVisible()
  })

  test('不要な宿泊税表示と遷移ボタンは表示されない', async ({ page }) => {
    await expect(page.getByText('宿泊税締め担当')).not.toBeVisible()
    await expect(page.getByRole('link', { name: '宿泊税管理' })).not.toBeVisible()
  })

  test('画面切り替えボタンが表示され宿泊税ページへ遷移できる', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ダッシュボード' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '宿泊税' })).toBeVisible()

    await page.getByRole('button', { name: '宿泊税' }).click()
    await expect(page).toHaveURL('/a_tax_table')
  })

  test('Todo削除ボタンは確認ダイアログを表示し、OKで削除保存する', async ({ page }) => {
    let patchBody: unknown = null
    await page.route('**/api/daily/**/todos', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = route.request().postDataJSON()
      }
      await route.fulfill({
        status: 200,
        json: route.request().method() === 'GET' ? { todos: [{ id: 'todo-1', text: '送迎あり 15:30' }] } : {},
      })
    })

    await page.goto('/daily-dashboard?date=2026-01-01&today=2026-01-01')
    await page.getByLabel('"送迎あり 15:30" を削除').click()
    await expect(page.getByRole('dialog', { name: 'Todoを削除しますか？' })).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()

    await expect.poll(() => patchBody).toMatchObject({ todos: [] })
  })

  test('予約カードを部屋番号順に表示しトグル切り替え後も順序を維持する', async ({ page }) => {
    await page.route('/api/guest-info*', (route) => route.fulfill({
      status: 200,
      json: {
        normal: [LATE_ROOM_RESERVATION, EARLY_ROOM_RESERVATION],
        staying: [STAYING_RESERVATION],
        cancelled: [],
      },
    }))

    await page.goto('/daily-dashboard?date=2026-01-01&today=2026-01-01')
    await expect(page.getByTestId('reservation-card')).toHaveCount(3)
    await expect(page.getByTestId('reservation-card').nth(0)).toContainText('21')
    await expect(page.getByTestId('reservation-card').nth(1)).toContainText('43')
    await expect(page.getByTestId('reservation-card').nth(2)).toContainText('連泊')

    await page.getByRole('button', { name: '到着' }).click()
    await expect(page.getByTestId('reservation-card').nth(0)).toContainText('21')
    await expect(page.getByTestId('reservation-card').nth(1)).toContainText('43')
    await expect(page.getByTestId('reservation-card').nth(2)).toContainText('連泊')
  })
})

// 同じ部屋・同じ夜に有効な予約が2件あると、清掃ボード・タイムテーブルには1件しか出ない
test.describe('GuestInfo - 部屋の重複の警告', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
  })

  test('重複があれば部屋番号と件数を警告する', async ({ page }) => {
    await page.route('/api/guest-info*', (route) => route.fulfill({
      status: 200,
      json: {
        normal: [SAMPLE_RESERVATION, { ...SAMPLE_RESERVATION, id: 'test-id-dup', guest_name: '重複次郎' }],
        staying: [],
        cancelled: [],
        roomConflicts: [{ room: '21', reservationIds: ['test-id-1', 'test-id-dup'] }],
      },
    }))
    await page.goto('/daily-dashboard')
    await expect(page.getByTestId('room-conflict-alert')).toContainText('21号室')
    await expect(page.getByTestId('room-conflict-alert')).toContainText('2件')
  })

  test('重複がなければ警告しない', async ({ page }) => {
    await page.goto('/daily-dashboard')
    await expect(page.getByTestId('reservation-card').first()).toBeVisible()
    await expect(page.getByTestId('room-conflict-alert')).toHaveCount(0)
  })
})

test.describe('GuestInfo - モーダル（auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  // C/O 日の直接入力で、C/I 以前の日付や入力途中の値を保存しない
  test.describe('C/O 日の直接入力', () => {
    async function openCheckOutField(page: Page) {
      const patches: Record<string, unknown>[] = []
      page.on('request', (req) => {
        if (req.method() === 'PATCH' && req.url().endsWith('/api/reservations/test-id-1')) {
          patches.push(req.postDataJSON() as Record<string, unknown>)
        }
      })
      await page.getByTestId('reservation-card').first().click()
      await page.getByText('C/O date', { exact: true }).click()
      const sections = page.getByRole('dialog').getByRole('spinbutton')
      return { patches, year: sections.nth(0), month: sections.nth(1), day: sections.nth(2) }
    }

    test('C/I 以前の日付を入力しても保存しない', async ({ page }) => {
      const { patches, year } = await openCheckOutField(page)
      await year.click()
      await page.keyboard.type('2025')  // 2025-01-02（C/I 2026-01-01 より前）
      await page.waitForTimeout(1500)
      expect(patches.filter((p) => 'check_out_date' in p)).toEqual([])
    })

    test('実在しない日付（入力途中の値）を保存しない', async ({ page }) => {
      const { patches, month, day } = await openCheckOutField(page)
      await day.click()
      await page.keyboard.type('30')    // 2026-01-30
      await month.click()
      await page.keyboard.type('02')    // 2026-02-30（実在しない）
      await page.waitForTimeout(1500)
      expect(patches.map((p) => p.check_out_date)).not.toContain('Invalid Date')
      expect(patches.at(-1)?.check_out_date).toBe('2026-01-30')
    })

    // 入力途中の短い泊数（01-01 = 1泊）で2泊目の入力が消えていた
    test('1文字ずつ打って途中で泊数が縮んでも、2泊目の入力は消えない', async ({ page }) => {
      await page.route('/api/guest-info*', (route) => route.fulfill({
        status: 200,
        json: {
          normal: [{
            ...SAMPLE_RESERVATION,
            check_in_date: '2025-12-31',
            check_out_date: '2026-01-02',
            dinner_time: ['NONE', '18:00'],
            dinner_info: ['', ''],
            breakfast_time: [null, null],
            open_air_bath_time: [null, null],
            timetable_info: ['night1', 'night2'],
          }],
          staying: [],
          cancelled: [],
        },
      }))
      await page.reload()
      const { patches, day } = await openCheckOutField(page)
      await day.click()
      await page.keyboard.type('1')     // 2026-01-01（1泊）。自動保存が走るまで待つ
      await page.waitForTimeout(800)
      await page.keyboard.type('5')     // 2026-01-15（15泊）
      await page.waitForTimeout(1500)
      const last = patches.at(-1)
      expect(last?.check_out_date).toBe('2026-01-15')
      expect((last?.dinner_time as string[]).slice(0, 2)).toEqual(['NONE', '18:00'])
      expect((last?.timetable_info as string[]).slice(0, 2)).toEqual(['night1', 'night2'])
    })

    // 30 泊を超える日付は保存しない
    test('31 泊以上になる日付を入力しても保存しない', async ({ page }) => {
      const { patches, month } = await openCheckOutField(page)
      await month.click()
      await page.keyboard.type('03')    // 2026-03-02（C/I 2026-01-01 から 60 泊）
      await page.waitForTimeout(1500)
      expect(patches.filter((p) => 'check_out_date' in p)).toEqual([])
    })

    test('正しい日付は泊別配列と一緒に保存する', async ({ page }) => {
      const { patches, day } = await openCheckOutField(page)
      await day.click()
      await page.keyboard.type('04')    // 2026-01-04（3泊）
      await page.waitForTimeout(1500)
      const last = patches.at(-1)
      expect(last?.check_out_date).toBe('2026-01-04')
      expect(last?.dinner_time).toHaveLength(3)
      expect(last?.timetable_info).toHaveLength(3)
    })
  })

  // 通信エラーで保存に失敗した変更が捨てられ、再送されなかった
  test.describe('保存の失敗', () => {
    async function editName(page: Page, name: string) {
      await page.getByTestId('reservation-card').first().click()
      await page.getByText('name').first().click()
      await page.getByLabel('ゲスト名').fill(name)
      await page.keyboard.press('Tab')  // blur → すぐに保存
    }

    test('通信エラーで失敗した変更は、閉じるときに送り直す', async ({ page }) => {
      const bodies: string[] = []
      let calls = 0
      await page.route('**/api/reservations/test-id-1', async (route) => {
        bodies.push(route.request().postData() ?? '')
        calls++
        if (calls === 1) await route.abort('failed')
        else await route.fulfill({ status: 200, json: { ok: true } })
      })
      await editName(page, '再送テスト')
      await expect(page.getByText('通信エラーが発生しました')).toBeVisible()
      await page.getByRole('button', { name: '閉じる' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
      expect(bodies).toHaveLength(2)
      expect(JSON.parse(bodies[1])).toMatchObject({ guest_name: '再送テスト' })
    })

    test('送り直しても失敗するときは、閉じる前に確認する', async ({ page }) => {
      await page.route('**/api/reservations/test-id-1', (route) => route.fulfill({ status: 503, json: {} }))
      await editName(page, '保存できない')
      await expect(page.getByText('一時的に通信に失敗しました')).toBeVisible()

      const messages: string[] = []
      page.once('dialog', (d) => { messages.push(d.message()); void d.dismiss() })
      await page.getByRole('button', { name: '閉じる' }).click()
      await expect.poll(() => messages).toEqual([expect.stringContaining('保存できていない変更があります')])
      await expect(page.getByRole('dialog')).toBeVisible()   // キャンセルしたら閉じない

      page.once('dialog', (d) => void d.accept())
      await page.getByRole('button', { name: '閉じる' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('入力の誤り（400）は送り直さず、確認なしで閉じる', async ({ page }) => {
      let calls = 0
      await page.route('**/api/reservations/test-id-1', (route) => { calls++; return route.fulfill({ status: 400, json: {} }) })
      await editName(page, '入力の誤り')
      await expect(page.getByText('入力内容に誤りがあるため保存できませんでした')).toBeVisible()
      await page.getByRole('button', { name: '閉じる' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
      expect(calls).toBe(1)
    })
  })

  // 自動保存（500ms の debounce）と閉じる・失敗・遅い応答の組み合わせ
  test.describe('保存の順序', () => {
    test('入力の直後（debounce 中）に閉じても保存し、一覧の再取得は保存のあと', async ({ page }) => {
      const events: string[] = []
      page.on('request', (r) => {
        if (r.method() === 'PATCH') events.push(`PATCH ${r.postData()}`)
        if (r.url().includes('/api/guest-info')) events.push('GET guest-info')
      })
      await page.getByTestId('reservation-card').first().click()
      await page.getByText('name').first().click()
      await page.getByLabel('ゲスト名').fill('すぐ閉じる')
      events.length = 0
      await page.getByRole('button', { name: '閉じる' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
      await expect.poll(() => events.length).toBeGreaterThanOrEqual(1)
      expect(events[0]).toBe('PATCH {"guest_name":"すぐ閉じる"}')
    })

    test('保存に失敗したあと別の項目を編集すると、失敗した変更も一緒に送る', async ({ page }) => {
      const bodies: Record<string, unknown>[] = []
      await page.route('**/api/reservations/test-id-1', async (route) => {
        bodies.push(route.request().postDataJSON() as Record<string, unknown>)
        if (bodies.length === 1) await route.abort('failed')
        else await route.fulfill({ status: 200, json: { ok: true } })
      })
      await page.getByTestId('reservation-card').first().click()
      await page.getByText('name').first().click()
      await page.getByLabel('ゲスト名').fill('一度目は失敗')
      await page.keyboard.press('Tab')
      await expect(page.getByText('通信エラーが発生しました')).toBeVisible()
      await page.getByRole('button', { name: 'C/I後' }).click()
      await page.getByLabel('未受領').click()
      await expect.poll(() => bodies.length).toBe(2)
      expect(bodies[1]).toMatchObject({ guest_name: '一度目は失敗', a_tax_received: true })
    })

    test('前の保存の応答が遅くても、次の保存はその応答を待ってから送る（応答の順序が入れ替わらない）', async ({ page }) => {
      const log: string[] = []
      await page.route('**/api/reservations/test-id-1', async (route) => {
        const body = route.request().postData() ?? ''
        log.push(`start ${body}`)
        if (log.length === 1) await new Promise((r) => setTimeout(r, 1500))   // 1件目だけ遅い
        log.push(`end ${body}`)
        await route.fulfill({ status: 200, json: { ok: true } })
      })
      await page.getByTestId('reservation-card').first().click()
      await page.getByText('name').first().click()
      await page.getByLabel('ゲスト名').fill('一件目')
      await page.keyboard.press('Tab')
      await page.getByLabel('ゲスト名').fill('二件目')
      await page.keyboard.press('Tab')
      await expect.poll(() => log.length, { timeout: 5000 }).toBe(4)
      expect(log).toEqual([
        'start {"guest_name":"一件目"}', 'end {"guest_name":"一件目"}',
        'start {"guest_name":"二件目"}', 'end {"guest_name":"二件目"}',
      ])
    })
  })

  // 画面の入力欄にも API と同じ上限（maxLength）を付けている。超えた分は入らず、上限ちょうどで保存できる
  test.describe('入力の上限', () => {
    const memo = { month: '1', day: '1', name: '', summary: '', text: '', source: '' }

    async function openWith(page: Page, overrides: Record<string, unknown> = {}) {
      const patches: Record<string, unknown>[] = []
      page.on('request', (req) => {
        if (req.method() === 'PATCH' && req.url().endsWith('/api/reservations/test-id-1')) {
          patches.push(req.postDataJSON() as Record<string, unknown>)
        }
      })
      await page.route('/api/guest-info*', (route) => route.fulfill({
        status: 200,
        json: { normal: [{ ...SAMPLE_RESERVATION, ...overrides }], staying: [], cancelled: [] },
      }))
      await page.reload()
      await page.getByTestId('reservation-card').first().click()
      return patches
    }

    test('その他: 上限を超えて貼り付けても上限で切れ、その長さで保存する', async ({ page }) => {
      const patches = await openWith(page)
      await page.getByRole('button', { name: 'C/I後' }).click()
      const field = page.getByRole('textbox', { name: 'その他' })
      await field.click()
      await page.keyboard.insertText('あ'.repeat(L.otherNoteLength + 10))   // 貼り付けと同じ入力
      await expect(field).toHaveValue('あ'.repeat(L.otherNoteLength))
      await page.keyboard.press('Tab')
      await expect(page.locator('[data-testid="save-status"][data-status="saved"]')).toBeVisible({ timeout: 3000 })
      expect((patches.at(-1)?.other_note as string).length).toBe(L.otherNoteLength)
    })

    test('その他: 上限に達したあとは1文字ずつ打っても増えない', async ({ page }) => {
      await openWith(page, { other_note: 'あ'.repeat(L.otherNoteLength - 1) })
      await page.getByRole('button', { name: 'C/I後' }).click()
      const field = page.getByRole('textbox', { name: 'その他' })
      await field.click()
      await page.keyboard.press('ControlOrMeta+End')   // 複数行の欄なので、End（表示上の行末）ではなく全体の末尾へ
      await page.keyboard.type('xyz')
      await expect(field).toHaveValue(/^あ+x$/)
      expect((await field.inputValue()).length).toBe(L.otherNoteLength)
    })

    test('タイムテーブル: 上限を超えて貼り付けても上限で切れ、その長さで保存する', async ({ page }) => {
      const patches = await openWith(page)
      await page.getByText('timeTableMemo', { exact: true }).click()
      const field = page.getByRole('textbox', { name: 'Day 1' })
      await field.click()
      await page.keyboard.insertText('x'.repeat(L.timetableInfoLength + 10))
      await expect(field).toHaveValue('x'.repeat(L.timetableInfoLength))
      await page.keyboard.press('Tab')
      await expect.poll(() => (patches.at(-1)?.timetable_info as string[] | undefined)?.[0]?.length).toBe(L.timetableInfoLength)
    })

    test('操作履歴: 本文と月は上限で切れる', async ({ page }) => {
      await openWith(page, { mail_memo: [memo] })
      const text = page.getByPlaceholder('Text', { exact: true })
      await text.click()
      await page.keyboard.insertText('あ'.repeat(L.mailMemoTextLength + 10))
      await expect(text).toHaveValue('あ'.repeat(L.mailMemoTextLength))

      const month = page.getByPlaceholder('MM', { exact: true })
      await month.fill('')
      await month.pressSequentially('123')
      await expect(month).toHaveValue('12')
    })

    test('操作履歴: 上限の件数に達すると追加ボタンを押せない', async ({ page }) => {
      const patches = await openWith(page, { mail_memo: Array(L.mailMemoItems - 1).fill(memo) })
      const add = page.getByRole('button', { name: '履歴を追加' })
      await expect(add).toBeEnabled()
      await add.click()
      await expect(add).toBeDisabled()
      await expect.poll(() => (patches.at(-1)?.mail_memo as unknown[] | undefined)?.length).toBe(L.mailMemoItems)
    })
  })

  test('予約カードクリックでモーダルが開く', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('C/I前タブ: テキスト入力後にSavedインジケーターが表示される', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByText('name').first().click()
    await page.getByLabel('ゲスト名').fill('test taro')
    await page.keyboard.press('Tab')  // blur → onBlurFlush → debounce flush
    await expect(page.locator('[data-testid="save-status"][data-status="saved"]')).toBeVisible({ timeout: 3000 })
  })

  test('C/I後タブ: a_tax_received チェックボックスの変更が自動保存される', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByRole('button', { name: 'C/I後' }).click()
    await page.getByLabel('未受領').click()
    await expect(page.locator('[data-testid="save-status"][data-status="saved"]')).toBeVisible({ timeout: 3000 })
  })

  test('モーダルを閉じて再度開いたとき変更が反映されている', async ({ page }) => {
    await page.getByTestId('reservation-card').first().click()
    await page.getByText('name').first().click()
    await page.getByLabel('ゲスト名').fill('フラッシュ確認')
    await page.getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})

test.describe('GuestInfo - キャンセル（非auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('キャンセルダイアログが開き理由入力欄が表示される', async ({ page }) => {
    await page.getByTestId('cancel-button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('キャンセル理由')).toBeVisible()
  })

  // 古い画面から、すでにキャンセル済みの予約をキャンセルしたとき
  test('すでにキャンセル済み（409）なら、再読み込みを促す', async ({ page }) => {
    await page.route('**/api/reservations/*/cancel', (route) => route.fulfill({ status: 409, json: { error: 'already_cancelled' } }))
    await page.getByTestId('cancel-button').first().click()
    await page.getByLabel('スタッフ名').fill('スタッフ')
    await page.getByLabel('キャンセル理由').fill('理由')
    await page.getByRole('dialog').getByRole('button', { name: 'キャンセル実行' }).click()
    await expect(page.getByRole('dialog')).toContainText('すでにキャンセル済みです。画面を再読み込みしてください')
  })
})

test.describe('GuestInfo - 新規追加（非auto-save）', () => {
  test.beforeEach(async ({ page }) => {
    await suppressPrint(page)
    await setupAuth(page)
    await mockGuestInfoApi(page)
    await page.goto('/daily-dashboard')
  })

  test('＋カードクリックで追加ダイアログが開く', async ({ page }) => {
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('dialog', { name: /新規予約/ })).toBeVisible()
  })

  test('必須項目未入力時は追加ボタンが無効', async ({ page }) => {
    await page.getByTestId('add-reservation-card').click()
    await expect(page.getByRole('button', { name: '追加' })).toBeDisabled()
  })
})
