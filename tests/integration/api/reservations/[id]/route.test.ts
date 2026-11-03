import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '@/app/api/reservations/[id]/route'
import { InfraError } from '@/types/errors'
import { MAX_NIGHTS, RESERVATION_LIMITS } from '@/constants/guestInfo'
import { setupFakeToday } from '@tests/utils/routeTestHelper'

vi.mock('@/application/guestInfo/updateReservationCommand')
import { updateReservationCommand } from '@/application/guestInfo/updateReservationCommand'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { notifySlackFireAndForget } from '@/lib/slack'

const mockCommand = vi.mocked(updateReservationCommand)
const mockVerifySession = vi.mocked(verifySession)

// FIXED_TODAY = 2026-05-20
setupFakeToday()

function makeRequest(body: unknown = { guest_name: 'テスト' }, withSession = true) {
  return new Request('http://localhost/api/reservations/doc1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'doc1' })

describe('PATCH /api/reservations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
    mockCommand.mockResolvedValue({ success: true, value: undefined })
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)
    const res = await PATCH(makeRequest({}, false), { params })
    expect(res.status).toBe(401)
  })

  it('空オブジェクトで400（patchが空）', async () => {
    const res = await PATCH(makeRequest({}), { params })
    expect(res.status).toBe(400)
  })

  it('正常リクエストで200', async () => {
    const res = await PATCH(makeRequest({ guest_name: 'テスト' }), { params })
    expect(res.status).toBe(200)
  })

  it('InfraErrorで503', async () => {
    mockCommand.mockRejectedValue(new InfraError('FIRESTORE_UNAVAILABLE', 'down'))
    const res = await PATCH(makeRequest({ guest_name: 'テスト' }), { params })
    expect(res.status).toBe(503)
  })

  describe('値の検査: Infra が読み取りで fallback に変える値は入口で拒否する', () => {
    it.each([
      ['arrival_time が許容値外', { arrival_time: '6:00' }],
      ['dinner_time の要素が許容値外', { dinner_time: ['18:15'] }],
      ['breakfast_time の要素が許容値外', { breakfast_time: ['8:00'] }],
      ['open_air_bath_time の要素が許容値外', { open_air_bath_time: ['23:00'] }],
    ])('%s で400', async (_label, body) => {
      const res = await PATCH(makeRequest(body), { params })
      expect(res.status).toBe(400)
      expect(mockCommand).not.toHaveBeenCalled()
    })

    it.each([
      ['arrival_time', { arrival_time: '06:00' }],
      ['arrival_time の null', { arrival_time: null }],
      ['dinner_time', { dinner_time: ['PENDING', '18:00'] }],
      ['breakfast_time', { breakfast_time: ['8:00a', null] }],
      ['open_air_bath_time', { open_air_bath_time: ['7:30', null] }],
    ])('許容値の %s は通す', async (_label, body) => {
      const res = await PATCH(makeRequest(body), { params })
      expect(res.status).toBe(200)
    })
  })

  // 全フィールドの上限ちょうど・上限+1 は tests/unit/constraints/reservationLimits.test.ts
  describe('入力の上限', () => {
    it.each([
      ['other_note が上限+1', { other_note: 'あ'.repeat(RESERVATION_LIMITS.otherNoteLength + 1) }],
      ['timetable_info の件数が上限+1', { timetable_info: Array(MAX_NIGHTS + 1).fill('') }],
      ['mail_memo の件数が上限+1', {
        mail_memo: Array.from({ length: RESERVATION_LIMITS.mailMemoItems + 1 }, () => (
          { month: '1', day: '1', name: '', summary: '', text: '', source: '' }
        )),
      }],
    ])('%s で400で、Command を呼ばない', async (_label, body) => {
      const res = await PATCH(makeRequest(body), { params })
      expect(res.status).toBe(400)
      expect(mockCommand).not.toHaveBeenCalled()
    })

    it('上限ちょうどは200', async () => {
      const res = await PATCH(makeRequest({ other_note: 'あ'.repeat(RESERVATION_LIMITS.otherNoteLength) }), { params })
      expect(res.status).toBe(200)
    })
  })

  describe('C/O 日', () => {
    it.each([
      ['入力途中の値', 'Invalid Date'],
      ['実在しない日', '2026-02-30'],
      ['実在しない月', '2026-13-01'],
      ['範囲外の未来（年の打ち間違い）', '2062-05-21'],
      ['範囲外の過去', '2025-01-01'],
    ])('%s（%s）で400', async (_label, date) => {
      const res = await PATCH(makeRequest({ check_out_date: date }), { params })
      expect(res.status).toBe(400)
      expect(mockCommand).not.toHaveBeenCalled()
    })
  })

  describe('既存の予約との整合', () => {
    it('Command が INVALID を返すと400で、Slack に通知しない', async () => {
      mockCommand.mockResolvedValue({
        success: false,
        error: { kind: 'INVALID', violations: [{ code: 'CHECK_OUT_NOT_AFTER_CHECK_IN' }] },
      })
      const res = await PATCH(makeRequest({ check_out_date: '2026-05-20' }), { params })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ violations: [{ code: 'CHECK_OUT_NOT_AFTER_CHECK_IN' }] })
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    })

    it('Command が NOT_FOUND を返すと404で、Slack に通知しない', async () => {
      mockCommand.mockResolvedValue({ success: false, error: { kind: 'NOT_FOUND' } })
      const res = await PATCH(makeRequest({ guest_name: 'テスト' }), { params })
      expect(res.status).toBe(404)
      expect(notifySlackFireAndForget).not.toHaveBeenCalled()
    })
  })

  // [id] を検証しておらず、Firestore が投げる例外が 503 + ALERT になっていた
  describe('[id] の検証', () => {
    it.each([
      ['空', ''],
      ['スラッシュを含む（%2F は Next.js がデコードして渡す）', 'a/b'],
      ['.', '.'],
      ['..', '..'],
      ['予約名（__x__）', '__x__'],
      ['1500 バイト超', 'あ'.repeat(501)],
    ])('%s で400', async (_label, id) => {
      const res = await PATCH(makeRequest({ guest_name: 'テスト' }), { params: Promise.resolve({ id }) })
      expect(res.status).toBe(400)
      expect(mockCommand).not.toHaveBeenCalled()
    })
  })
})
