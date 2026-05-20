import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from './route'
import { InfraError } from '@/types/errors'

vi.mock('@/infra/daily/firestoreDailyRepository')
import { firestoreDailyRepository } from '@/infra/daily/firestoreDailyRepository'

vi.mock('@/lib/auth/verifySession')
import { verifySession } from '@/lib/auth/verifySession'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockRepo = vi.mocked(firestoreDailyRepository)
const mockVerifySession = vi.mocked(verifySession)

const params = Promise.resolve({ date: '2026-05-06' })
const validBody = { todos: [{ id: 'todo-1', text: '送迎あり 15:30' }] }

function makeGetRequest(withSession = true) {
  return new Request('http://localhost/api/daily/2026-05-06/todos', {
    method: 'GET',
    headers: withSession ? { cookie: 'session=valid' } : {},
  })
}

function makePatchRequest(body: unknown = validBody, withSession = true) {
  return new Request('http://localhost/api/daily/2026-05-06/todos', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(withSession ? { cookie: 'session=valid' } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('GET /api/daily/[date]/todos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
    mockRepo.fetchDailyTodos = vi.fn().mockResolvedValue(validBody.todos)
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)

    const res = await GET(makeGetRequest(false), { params })

    expect(res.status).toBe(401)
  })

  it('date形式が不正で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2026/05/06' }) })

    expect(res.status).toBe(400)
  })

  it('存在しない日付（2026-02-30）で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2026-02-30' }) })

    expect(res.status).toBe(400)
  })

  it('範囲外の日付（過去: 2000-01-01）で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2000-01-01' }) })

    expect(res.status).toBe(400)
  })

  it('範囲外の日付（未来: 2099-12-31）で400', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ date: '2099-12-31' }) })

    expect(res.status).toBe(400)
  })

  it('正常リクエストで200とtodosを返す', async () => {
    const res = await GET(makeGetRequest(), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.todos).toEqual(validBody.todos)
    expect(mockRepo.fetchDailyTodos).toHaveBeenCalledWith('2026-05-06')
  })

  it('FIRESTORE_UNAVAILABLEを503へ変換する', async () => {
    mockRepo.fetchDailyTodos = vi.fn().mockRejectedValue(
      new InfraError('FIRESTORE_UNAVAILABLE', 'down'),
    )

    const res = await GET(makeGetRequest(), { params })

    expect(res.status).toBe(503)
  })

  it('FIRESTORE_DATA_CORRUPTIONを500へ変換する', async () => {
    mockRepo.fetchDailyTodos = vi.fn().mockRejectedValue(
      new InfraError('FIRESTORE_DATA_CORRUPTION', 'bad todos'),
    )

    const res = await GET(makeGetRequest(), { params })

    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/daily/[date]/todos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifySession.mockResolvedValue({ uid: 'user-1' })
    mockRepo.updateDailyTodos = vi.fn().mockResolvedValue(undefined)
  })

  it('未認証で401', async () => {
    mockVerifySession.mockResolvedValue(null)

    const res = await PATCH(makePatchRequest(validBody, false), { params })

    expect(res.status).toBe(401)
  })

  it('date形式が不正で400', async () => {
    const res = await PATCH(makePatchRequest(), { params: Promise.resolve({ date: '2026/05/06' }) })

    expect(res.status).toBe(400)
  })

  it('存在しない日付（2026-02-30）で400', async () => {
    const res = await PATCH(makePatchRequest(), { params: Promise.resolve({ date: '2026-02-30' }) })

    expect(res.status).toBe(400)
  })

  it('範囲外の日付（過去: 2000-01-01）で400', async () => {
    const res = await PATCH(makePatchRequest(), { params: Promise.resolve({ date: '2000-01-01' }) })

    expect(res.status).toBe(400)
  })

  it('todosが50件を超えると400', async () => {
    const body = {
      todos: Array.from({ length: 51 }, (_, i) => ({ id: `todo-${i}`, text: 'x' })),
    }

    const res = await PATCH(makePatchRequest(body), { params })

    expect(res.status).toBe(400)
  })

  it('todo textが空文字で400', async () => {
    const res = await PATCH(makePatchRequest({ todos: [{ id: 'todo-1', text: '' }] }), { params })

    expect(res.status).toBe(400)
  })

  it('正常リクエストで200', async () => {
    const res = await PATCH(makePatchRequest(), { params })

    expect(res.status).toBe(200)
    expect(mockRepo.updateDailyTodos).toHaveBeenCalledWith('2026-05-06', validBody.todos)
  })

  it('FIRESTORE_UNAVAILABLEを503へ変換する', async () => {
    mockRepo.updateDailyTodos = vi.fn().mockRejectedValue(
      new InfraError('FIRESTORE_UNAVAILABLE', 'down'),
    )

    const res = await PATCH(makePatchRequest(), { params })

    expect(res.status).toBe(503)
  })

  it('FIRESTORE_DATA_CORRUPTIONを500へ変換する', async () => {
    mockRepo.updateDailyTodos = vi.fn().mockRejectedValue(
      new InfraError('FIRESTORE_DATA_CORRUPTION', 'bad todos'),
    )

    const res = await PATCH(makePatchRequest(), { params })

    expect(res.status).toBe(500)
  })
})
