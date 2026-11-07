import { test, expect, type Page, type Route } from '@playwright/test'

// ゲストカードの取り直し（Domain.md「予約カードと編集モーダル」）を、本物のブラウザと Next.js のルーターで確かめる:
// - 日付の切り替えはサーバーへの往復（RSC）なしで ?date= を変え、その日のカードを毎回取り直す
// - 日付を切り替えたら前の日のカードを一度も出さない（応答の順序が入れ替わっても）
// - 閉じる・追加・キャンセルの後の取り直し中は、前のカードを薄く出して操作を止める
// API はブラウザ側でモックする

const TODAY = '2026-04-12'

function reservation(id: string, date: string, name: string, room = '21') {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    id, guest_name: name, room, check_in_date: date, check_out_date: next.toISOString().slice(0, 10),
    adult_count: 2, child_count: 0, cancel: 0, late_out: 0, arrival_time: null,
    dinner_time: ['NONE'], dinner_info: [''], breakfast_time: [null], open_air_bath_time: [null], timetable_info: [''],
    reservation_number: id, booking_site: 'other', mail_memo: [], a_tax_received: false, a_tax_received_by_staff_name: '',
    check_in_staff_name: '', country: null, city: '', age_groups: [null, null], group_type: null, purpose: null,
    tourism_type: null, profession: '', other_note: '',
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type GuestInfoHandler = (date: string, n: number, route: Route) => Promise<void>

// guest-info は日付ごとの取得回数 n を名前に入れて返す（既定）。handler で応答を差し替えられる
async function setup(page: Page, handler?: GuestInfoHandler) {
  await page.context().addCookies([{ name: 'session', value: 'mock-session', domain: '127.0.0.1', path: '/' }])
  await page.route('**/api/**', (route) => route.fulfill({ status: 404, json: { error: 'not mocked' } }))
  await page.route('**/api/daily/**/todos', (route) => route.fulfill({ json: { todos: [] } }))
  await page.route('**/api/reservations/**', (route) => route.fulfill({ json: {} }))
  const counts = new Map<string, number>()
  await page.route('**/api/guest-info*', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? ''
    const n = (counts.get(date) ?? 0) + 1
    counts.set(date, n)
    if (handler) return handler(date, n, route)
    await route.fulfill({ json: { normal: [reservation(`id-${date}`, date, `客${date}#${n}`)], staying: [], cancelled: [], roomConflicts: [] } })
  })
  // サーバーへのページの取得（RSC）を数える
  const rscRequests: string[] = []
  page.on('request', (req) => {
    const h = req.headers()
    if (h['rsc'] === '1' || req.url().includes('_rsc=')) rscRequests.push(req.url())
  })
  // 画面に出たカードの名前を、出た順にすべて記録する（一瞬でも出たものを拾う）
  await page.addInitScript(() => {
    const w = window as unknown as { __seenNames: string[] }
    w.__seenNames = []
    const record = () => {
      for (const el of Array.from(document.querySelectorAll('[data-testid="reservation-card"]'))) {
        const t = el.textContent ?? ''
        if (w.__seenNames[w.__seenNames.length - 1] !== t) w.__seenNames.push(t)
      }
    }
    new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true })
  })
  return { counts, rscRequests }
}

// その日の最新の取得の結果がカードに出るのを待ち、その回数を返す。
// 開発サーバーは StrictMode で最初の表示の effect を2回動かすので、何回目かを決め打ちしない
async function expectLatest(page: Page, counts: Map<string, number>, date: string): Promise<number> {
  await expect.poll(async () => {
    const n = counts.get(date)
    return n === undefined ? 0 : card(page, `客${date}#${n}`).count()
  }).toBe(1)
  return counts.get(date) ?? 0
}

const seenNames = (page: Page) => page.evaluate(() => (window as unknown as { __seenNames: string[] }).__seenNames)
const card = (page: Page, text: string) => page.getByTestId('reservation-card').filter({ hasText: text })

test.describe('日付の切り替え', () => {
  test('サーバーへの往復なしで ?date= を変え、その日のカードを取り直す。?today= は残す', async ({ page }) => {
    const { counts, rscRequests } = await setup(page)
    await page.goto(`/daily-dashboard?today=${TODAY}`)
    const first = await expectLatest(page, counts, TODAY)
    rscRequests.length = 0

    await page.getByTestId('next-day').click()
    await expectLatest(page, counts, '2026-04-13')
    await expect(page).toHaveURL(/[?&]date=2026-04-13/)
    await expect(page).toHaveURL(/[?&]today=2026-04-12/)
    await page.getByTestId('prev-day').click()
    // 前に見た日も取り直す
    expect(await expectLatest(page, counts, TODAY)).toBe(first + 1)
    await page.getByTestId('next-day').click()
    await expectLatest(page, counts, '2026-04-13')
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page).not.toHaveURL(/[?&]date=/)
    expect(await expectLatest(page, counts, TODAY)).toBe(first + 2)
    expect(rscRequests).toEqual([])
  })

  test('翌日を連打して応答の順序が入れ替わっても、最後の日のカードだけを出し、途中の日のカードを一度も出さない', async ({ page }) => {
    // 先に頼んだ日ほど遅く返す
    const delays: Record<string, number> = { '2026-04-13': 900, '2026-04-14': 500, '2026-04-15': 100 }
    const { counts } = await setup(page, async (date, n, route) => {
      await sleep(delays[date] ?? 0)
      await route.fulfill({ json: { normal: [reservation(`id-${date}`, date, `客${date}#${n}`)], staying: [], cancelled: [], roomConflicts: [] } })
    })
    await page.goto(`/daily-dashboard?today=${TODAY}`)
    await expectLatest(page, counts, TODAY)
    await page.evaluate(() => { (window as unknown as { __seenNames: string[] }).__seenNames = [] })

    for (let i = 0; i < 3; i++) await page.getByTestId('next-day').click()
    await expect(page.getByTestId('date-label')).toContainText('4 / 15')
    await expect(card(page, '客2026-04-15#1')).toBeVisible()
    // 遅れて届く 13日・14日の応答を待ってから確かめる
    await sleep(1200)
    await expect(card(page, '客2026-04-15#1')).toBeVisible()
    // 途中の日（13日・14日）のカードは一度も出ない。今日のカードは1回目のクリックの前に出ているので数えない
    const seen = await seenNames(page)
    expect(seen.filter((t) => t.includes('客2026-04-13') || t.includes('客2026-04-14'))).toEqual([])
  })

  test('ブラウザの戻る・進むで日付とカードがそろう', async ({ page }) => {
    const { counts } = await setup(page)
    await page.goto(`/daily-dashboard?today=${TODAY}`)
    const today1 = await expectLatest(page, counts, TODAY)
    await page.getByTestId('next-day').click()
    const next1 = await expectLatest(page, counts, '2026-04-13')

    await page.goBack()
    await expect(page.getByTestId('date-label')).toContainText('4 / 12')
    expect(await expectLatest(page, counts, TODAY)).toBe(today1 + 1)
    await page.goForward()
    await expect(page.getByTestId('date-label')).toContainText('4 / 13')
    expect(await expectLatest(page, counts, '2026-04-13')).toBe(next1 + 1)
  })
})

test.describe('閉じた後の取り直し', () => {
  test('取り直し中は前のカードを薄く出し、押してもモーダルが開かない。届いたら入れ替わり、また押せる', async ({ page }) => {
    let release: (() => void) | null = null
    let hold = false
    await setup(page, async (date, _n, route) => {
      // hold の間に来た取得（閉じた後の取り直し）は、テストが離すまで返さない
      const name = hold ? '新しいカード' : '前のカード'
      if (hold) await new Promise<void>((r) => { release = r })
      await route.fulfill({ json: { normal: [reservation('rsv-1', date, name)], staying: [], cancelled: [], roomConflicts: [] } })
    })
    await page.goto(`/daily-dashboard?today=${TODAY}`)
    await card(page, '前のカード').click()
    hold = true
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await expect(page.getByTestId('guest-info-refreshing')).toBeVisible()
    await expect(card(page, '前のカード')).toBeVisible()
    await expect(card(page, '前のカード')).toHaveAttribute('aria-disabled', 'true')
    await card(page, '前のカード').click({ force: true })
    await page.getByTestId('add-reservation-card').click({ force: true })
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect.poll(() => release !== null).toBe(true)
    release!()
    await expect(card(page, '新しいカード')).toBeVisible()
    await expect(page.getByTestId('guest-info-refreshing')).toHaveCount(0)
    await card(page, '新しいカード').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('名前を変えて閉じたら、取り直した新しい値をカードに出す', async ({ page }) => {
    let saved: { guest_name?: string } = {}
    await setup(page, async (date, _n, route) => {
      await route.fulfill({ json: { normal: [{ ...reservation('rsv-1', date, '前の名前'), ...saved }], staying: [], cancelled: [], roomConflicts: [] } })
    })
    // setup の既定のモックより後に登録する（後に登録したものが優先される）
    await page.route('**/api/reservations/rsv-1', async (route) => {
      saved = { ...saved, ...(route.request().postDataJSON() as object) }
      await route.fulfill({ json: {} })
    })
    await page.goto(`/daily-dashboard?today=${TODAY}`)
    await card(page, '前の名前').click()
    await page.getByRole('dialog').getByText('name', { exact: true }).click()
    await page.getByLabel('ゲスト名').fill('新しい名前')
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click()
    await expect(card(page, '新しい名前')).toBeVisible()
    await expect(card(page, '前の名前')).toHaveCount(0)
  })

  test('取り直しに失敗したら、前のカードを残さずエラーを出す', async ({ page }) => {
    let fail = false
    await setup(page, async (date, _n, route) => {
      if (fail) return route.fulfill({ status: 503, json: {} })
      await route.fulfill({ json: { normal: [reservation('rsv-1', date, '前のカード')], staying: [], cancelled: [], roomConflicts: [] } })
    })
    await page.goto(`/daily-dashboard?today=${TODAY}`)
    await card(page, '前のカード').click()
    fail = true
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click()
    await expect(page.getByText('一時的に通信に失敗しました')).toBeVisible()
    await expect(page.getByTestId('reservation-card')).toHaveCount(0)
  })
})
