import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { addDays, getTodayJST } from '../../src/lib/dateUtils'

// ゲストカードが出るまでの時間を測る（npm run perf）。合否は判定せず、結果を perf-results/<PERF_LABEL>.json に書く。
// PERF_LABEL=baseline で変更前を、PERF_LABEL=after で変更後を取り、after のときは baseline と並べて出す。
//
// 条件をそろえるため、遅れは固定にする:
// - API はブラウザ側でモックし、決まった時間だけ待って返す（本番のサーバー処理と Firestore の分の代わり）
// - ページ・RSC・JS の読み込みには CDP で往復の遅れを足す（モックした API の応答には効かない）
// 時間はページの中で測る（performance.now と requestAnimationFrame）。Playwright の待機は確認の間隔が粗いため

const RUNS = Number(process.env.PERF_RUNS ?? 10)
const LABEL = process.env.PERF_LABEL ?? 'latest'
const NETWORK_LATENCY_MS = 100
const GUEST_INFO_DELAY_MS = 300
const TODOS_DELAY_MS = 150
const PATCH_DELAY_MS = 300
const TIMEOUT_MS = 15_000

// 本番ビルドは ?today= を無視するので、JST の今日を基準にする
const TODAY = getTodayJST()

// hiddenMs: カードが1枚も出ていなかった時間。blankMs: カードもスピナーも出ていなかった時間（何も変化が見えない時間）
type Sample = { ms: number; hiddenMs: number; blankMs: number }
const results: Record<string, Sample[]> = {}

function record(name: string, sample: Sample) {
  ;(results[name] ??= []).push(sample)
}

// 日付ごとの guest-info の取得回数。カードの名前に入れ、「その日の、新しく取ったカード」が出た時刻を測る
type Counter = Map<string, number>

function guestName(date: string, n: number) {
  return `G${date}#${n}`
}

function reservationFor(date: string, n: number) {
  return {
    id: `perf-${date}`,
    guest_name: guestName(date, n),
    room: '21',
    check_in_date: date,
    check_out_date: addDays(date, 1),
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
    reservation_number: `perf-${date}`,
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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function setup(page: Page): Promise<Counter> {
  const counter: Counter = new Map()
  await page.context().addCookies([{ name: 'session', value: 'mock-session', domain: '127.0.0.1', path: '/' }])
  await page.addInitScript(() => { window.print = () => {} })

  await page.route('**/api/**', (route) => route.fulfill({ status: 404, json: { error: 'not mocked' } }))
  await page.route('**/api/guest-info*', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') ?? ''
    const n = (counter.get(date) ?? 0) + 1
    counter.set(date, n)
    await sleep(GUEST_INFO_DELAY_MS)
    await route.fulfill({ json: { normal: [reservationFor(date, n)], staying: [], cancelled: [], roomConflicts: [] } })
  })
  await page.route('**/api/daily/**/todos', async (route) => {
    await sleep(TODOS_DELAY_MS)
    await route.fulfill({ json: { todos: [] } })
  })
  await page.route('**/api/reservations/**', async (route) => {
    await sleep(PATCH_DELAY_MS)
    await route.fulfill({ json: {} })
  })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: NETWORK_LATENCY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  return counter
}

type Trigger = { kind: 'click'; selector: string } | { kind: 'back' }

// trigger を実行してから、expectText を含むカードが出るまでの時間。
// hiddenMs は、その間カードが1枚も出ていなかった時間。blankMs は、カードもスピナーも出ていなかった時間
async function measure(page: Page, trigger: Trigger, expectText: string): Promise<Sample> {
  return page.evaluate(
    ({ trigger, expectText, timeout }) =>
      new Promise<{ ms: number; hiddenMs: number; blankMs: number }>((resolve, reject) => {
        const cards = () => Array.from(document.querySelectorAll('[data-testid="reservation-card"]'))
        const spinnerShown = () => document.querySelector('[role="progressbar"]') !== null
        const found = () => cards().some((el) => (el.textContent ?? '').includes(expectText))
        const t0 = performance.now()
        let last = t0
        let hiddenMs = 0
        let blankMs = 0
        if (trigger.kind === 'click') {
          const el = document.querySelector<HTMLElement>(trigger.selector)
          if (!el) return reject(new Error(`not found: ${trigger.selector}`))
          el.click()
        } else {
          history.back()
        }
        const tick = () => {
          const now = performance.now()
          const noCards = cards().length === 0
          if (noCards) hiddenMs += now - last
          if (noCards && !spinnerShown()) blankMs += now - last
          last = now
          if (found()) return resolve({ ms: now - t0, hiddenMs, blankMs })
          if (now - t0 > timeout) return reject(new Error(`timeout: ${expectText}`))
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { trigger, expectText, timeout: TIMEOUT_MS },
  )
}

async function waitForCard(page: Page, text: string) {
  await expect(page.getByTestId('reservation-card').filter({ hasText: text })).toBeVisible({ timeout: TIMEOUT_MS })
}

async function openDashboard(page: Page, date: string) {
  await page.goto(`/daily-dashboard?date=${date}`)
  await waitForCard(page, guestName(date, 1).replace(/#\d+$/, '#'))
}

test.describe.configure({ mode: 'serial' })

test('初回表示: ページを開いてからカードが出るまで', async ({ page }) => {
  await setup(page)
  // ページの読み込みの最初から、カードが出た時刻を記録する
  await page.addInitScript(() => {
    const w = window as unknown as { __perfCardAt?: number }
    const tick = () => {
      if (document.querySelector('[data-testid="reservation-card"]')) {
        w.__perfCardAt = performance.now()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  // 1回目は JS をブラウザのキャッシュに入れるためで、数えない（スタッフの PC は毎日同じ画面を開く）
  await openDashboard(page, TODAY)
  for (let i = 0; i < RUNS; i++) {
    await openDashboard(page, TODAY)
    const ms = await page.evaluate(() => (window as unknown as { __perfCardAt?: number }).__perfCardAt ?? NaN)
    record('初回表示', { ms, hiddenMs: NaN, blankMs: NaN })
  }
})

test('日付の切り替え: 翌日へ・前日へ', async ({ page }) => {
  const counter = await setup(page)
  const tomorrow = addDays(TODAY, 1)
  await openDashboard(page, TODAY)
  for (let i = 0; i < RUNS; i++) {
    const nextN = (counter.get(tomorrow) ?? 0) + 1
    record('翌日へ', await measure(page, { kind: 'click', selector: '[data-testid="next-day"]' }, guestName(tomorrow, nextN)))
    const prevN = (counter.get(TODAY) ?? 0) + 1
    record('前日へ', await measure(page, { kind: 'click', selector: '[data-testid="prev-day"]' }, guestName(TODAY, prevN)))
  }
})

test('日付の切り替え: ブラウザの「戻る」', async ({ page }) => {
  const counter = await setup(page)
  const tomorrow = addDays(TODAY, 1)
  await openDashboard(page, TODAY)
  for (let i = 0; i < RUNS; i++) {
    const tomorrowN = (counter.get(tomorrow) ?? 0) + 1
    await page.getByTestId('next-day').click()
    await waitForCard(page, guestName(tomorrow, tomorrowN))
    const n = (counter.get(TODAY) ?? 0) + 1
    record('ブラウザの戻る', await measure(page, { kind: 'back' }, guestName(TODAY, n)))
  }
})

test('日付の切り替え: カレンダーで選ぶ', async ({ page }) => {
  const counter = await setup(page)
  // 同じ月の中で選ぶ（月をまたぐとカレンダーの月送りが要る）
  const plus2 = addDays(TODAY, 2)
  const target = plus2.slice(0, 7) === TODAY.slice(0, 7) ? plus2 : addDays(TODAY, -2)
  const day = String(Number(target.slice(8, 10)))
  await openDashboard(page, TODAY)
  for (let i = 0; i < RUNS; i++) {
    await page.getByRole('button', { name: '日付を選択' }).click()
    const cell = page.getByRole('gridcell', { name: day, exact: true })
    await cell.evaluate((el) => el.setAttribute('data-perf-target', '1'))
    const n = (counter.get(target) ?? 0) + 1
    record('カレンダーで選ぶ', await measure(page, { kind: 'click', selector: '[data-perf-target="1"]' }, guestName(target, n)))
    // 今日に戻す（測らない）
    const todayN = (counter.get(TODAY) ?? 0) + 1
    await page.getByRole('button', { name: 'Today' }).click()
    await waitForCard(page, guestName(TODAY, todayN))
  }
})

test('モーダルを閉じる: 変更なし・変更あり', async ({ page }) => {
  const counter = await setup(page)
  await openDashboard(page, TODAY)
  const closeSelector = '[role="dialog"] button[aria-label="閉じる"]'
  for (let i = 0; i < RUNS; i++) {
    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const n1 = (counter.get(TODAY) ?? 0) + 1
    record('モーダルを閉じる（変更なし）', await measure(page, { kind: 'click', selector: closeSelector }, guestName(TODAY, n1)))
    await expect(page.getByRole('dialog')).toBeHidden()

    await page.getByTestId('reservation-card').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // 入力の直後に閉じる（保存を待ってから一覧を取り直す場面）
    await page.getByRole('dialog').getByText('name', { exact: true }).click()
    await page.getByRole('textbox', { name: 'ゲスト名' }).press('End')
    await page.keyboard.type('x')
    const n2 = (counter.get(TODAY) ?? 0) + 1
    record('モーダルを閉じる（変更あり）', await measure(page, { kind: 'click', selector: closeSelector }, guestName(TODAY, n2)))
    await expect(page.getByRole('dialog')).toBeHidden()
  }
})

type Summary = { runs: number; medianMs: number; p90Ms: number; hiddenMedianMs: number | null; blankMedianMs?: number | null }

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return Math.round(sorted[idx])
}

test.afterAll(() => {
  const summary: Record<string, Summary> = {}
  for (const [name, samples] of Object.entries(results)) {
    const hidden = samples.map((s) => s.hiddenMs).filter((v) => !Number.isNaN(v))
    const blank = samples.map((s) => s.blankMs).filter((v) => !Number.isNaN(v))
    summary[name] = {
      runs: samples.length,
      medianMs: quantile(samples.map((s) => s.ms), 0.5),
      p90Ms: quantile(samples.map((s) => s.ms), 0.9),
      hiddenMedianMs: hidden.length > 0 ? quantile(hidden, 0.5) : null,
      blankMedianMs: blank.length > 0 ? quantile(blank, 0.5) : null,
    }
  }
  const dir = path.resolve(__dirname, '../../perf-results')
  mkdirSync(dir, { recursive: true })
  const conditions = { networkLatencyMs: NETWORK_LATENCY_MS, guestInfoDelayMs: GUEST_INFO_DELAY_MS, todosDelayMs: TODOS_DELAY_MS, patchDelayMs: PATCH_DELAY_MS }
  // --grep で一部の場面だけ測り直したときは、同じ label の前の結果に上書きで足す
  const outPath = path.join(dir, `${LABEL}.json`)
  const previous: Record<string, Summary> = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, 'utf8')) as { summary: Record<string, Summary> }).summary
    : {}
  const merged = { ...previous, ...summary }
  writeFileSync(outPath, JSON.stringify({ label: LABEL, measuredAt: new Date().toISOString(), conditions, summary: merged }, null, 2))

  const baselinePath = path.join(dir, 'baseline.json')
  const baseline: Record<string, Summary> | null =
    LABEL !== 'baseline' && existsSync(baselinePath)
      ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as { summary: Record<string, Summary> }).summary
      : null
  console.table(
    Object.fromEntries(
      Object.entries(summary).map(([name, s]) => [
        name,
        {
          '中央値(ms)': s.medianMs,
          'p90(ms)': s.p90Ms,
          'カードが消えていた(ms)': s.hiddenMedianMs ?? '-',
          '何も出ていなかった(ms)': s.blankMedianMs ?? '-',
          ...(baseline?.[name]
            ? { 'baseline 中央値(ms)': baseline[name].medianMs, '差(ms)': s.medianMs - baseline[name].medianMs }
            : {}),
        },
      ]),
    ),
  )
})
