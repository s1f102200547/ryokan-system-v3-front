// 状態遷移（BugHunting.md §3.7）: 予約の状態（通常・キャンセル済み）× 操作（編集・キャンセル・復活・宿泊税チェック）。
// 同じ操作を2回・キャンセル済みへの操作・存在しない予約への操作を、Emulator に実際に送って確かめる
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { adminDb } from '@/lib/firebase/admin'
import { addDays, getTodayJST } from '@/lib/dateUtils'
import { PATCH as UPDATE } from '@/app/api/reservations/[id]/route'
import { PATCH as CANCEL } from '@/app/api/reservations/[id]/cancel/route'
import { PATCH as RESTORE } from '@/app/api/reservations/[id]/restore/route'
import { PATCH as ATAX } from '@/app/api/reservations/[id]/a-tax/route'

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn().mockResolvedValue({ uid: 'emulator-test' }) }))
vi.mock('@/lib/slack', () => ({ notifySlack: vi.fn(), notifySlackFireAndForget: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
import { notifySlackFireAndForget } from '@/lib/slack'

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>
const RUN_ID = `emutest-state-${Date.now()}`
const CHECK_IN = addDays(getTodayJST(), 5)
const toFirestoreDate = (d: string) => d.replace(/-/g, '/')
const createdIds: string[] = []
const staff = { staff_name: 'スタッフ', target_date: getTodayJST(), reason: '理由' }
const OPS = {
  編集: [UPDATE, { guest_name: '編集' }],
  キャンセル: [CANCEL, staff],
  復活: [RESTORE, staff],
  宿泊税チェック: [ATAX, { a_tax_received: true }],
} as const
type Op = keyof typeof OPS

async function call(op: Op, id: string): Promise<number> {
  const [handler, body] = OPS[op]
  const res = await (handler as Handler)(
    new Request(`http://localhost/api/reservations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: 'session=emulator-test' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
  return res.status
}

async function createReservation(cancel: 0 | 1): Promise<string> {
  const id = `${RUN_ID}-${createdIds.length}`
  createdIds.push(id)
  await adminDb.collection('guestInfoV2').doc(id).set({
    check_in_date: toFirestoreDate(CHECK_IN), check_out_date: toFirestoreDate(addDays(CHECK_IN, 1)),
    adult_count: 1, child_count: 0, room: '21', cancel, mail_memo: [],
  })
  return id
}

async function read(id: string) {
  const d = (await adminDb.collection('guestInfoV2').doc(id).get()).data()!
  return { cancel: d.cancel as number, memo: (d.mail_memo as { summary: string }[]).map((m) => m.summary) }
}

beforeAll(() => {
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
})

afterAll(async () => {
  await Promise.all(createdIds.map((id) => adminDb.collection('guestInfoV2').doc(id).delete()))
})

// 状態, 操作, 1回目の status, 2回目の status, 2回目のあとの cancel, 履歴, Slack の通知数
const MATRIX: [state: 0 | 1, op: Op, first: number, second: number, cancel: number, memo: string[], slack: number][] = [
  [0, '編集', 200, 200, 0, [], 0],
  [0, 'キャンセル', 200, 409, 1, ['手動キャンセル'], 1],
  [0, '復活', 409, 409, 0, [], 0],
  [0, '宿泊税チェック', 200, 200, 0, [], 0],
  [1, '編集', 200, 200, 1, [], 0],
  [1, 'キャンセル', 409, 409, 1, [], 0],
  [1, '復活', 200, 409, 0, ['手動キャンセル復活'], 1],
  [1, '宿泊税チェック', 200, 200, 1, [], 0],
]

// BugHunting.md #27: すでにその状態のキャンセル・復活でも 200 で、操作履歴と Slack 通知が増えていた
describe.each(MATRIX)('状態 cancel=%i に「%s」を2回', (state, op, first, second, cancel, memo, slack) => {
  it(`${first} → ${second}、履歴 ${memo.length} 件、通知 ${slack} 回`, async () => {
    const id = await createReservation(state)
    vi.mocked(notifySlackFireAndForget).mockClear()
    expect(await call(op, id)).toBe(first)
    expect(await call(op, id)).toBe(second)
    expect(await read(id)).toEqual({ cancel, memo })
    expect(notifySlackFireAndForget).toHaveBeenCalledTimes(slack)
  })
})

describe.each(Object.keys(OPS) as Op[])('存在しない予約に「%s」', (op) => {
  it('404（通知しない）', async () => {
    vi.mocked(notifySlackFireAndForget).mockClear()
    expect(await call(op, `${RUN_ID}-none`)).toBe(404)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })
})

it('キャンセル → 復活 → キャンセルは、操作のたびに履歴が増える', async () => {
  const id = await createReservation(0)
  for (const op of ['キャンセル', '復活', 'キャンセル'] as const) expect(await call(op, id)).toBe(200)
  expect(await read(id)).toEqual({ cancel: 1, memo: ['手動キャンセル', '手動キャンセル復活', '手動キャンセル'] })
})
