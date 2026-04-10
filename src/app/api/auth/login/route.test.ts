import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

// adminAuth の verifyIdToken / createSessionCookie をモック
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
  },
  adminDb: {},
}))
import { adminAuth } from '@/lib/firebase/admin'

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))

const mockVerifyIdToken = vi.mocked(adminAuth.verifyIdToken)
const mockCreateSessionCookie = vi.mocked(adminAuth.createSessionCookie)

function makeRequest(body: object) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('有効な idToken がクライアントから来たら 200 と session Cookie を返す', async () => {
    mockVerifyIdToken.mockResolvedValue({} as never)
    mockCreateSessionCookie.mockResolvedValue('session-cookie-value')

    const response = await POST(makeRequest({ idToken: 'valid-id-token' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(response.headers.get('set-cookie')).toContain('session=')
  })

  it('クライアントからのデータにidToken がない場合 400 を返す', async () => {
    const response = await POST(makeRequest({}))

    expect(response.status).toBe(400)
  })

  it('クライアントからのidToken が空文字の場合 400 を返す', async () => {
    const response = await POST(makeRequest({ idToken: '' }))

    expect(response.status).toBe(400)
  })

  it('verifyIdToken が認証失敗コードを返した場合 401 を返す', async () => {
    // CREDENTIAL_ERROR_CODES に含まれる code を持つエラー（Firebase Admin が実際に throw する形式）
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/invalid-id-token', message: 'invalid token' })

    const response = await POST(makeRequest({ idToken: 'invalid-id-token' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('invalid_credentials')
  })

  it('verifyIdToken がインフラ障害（認証失敗コード以外）の場合 503 を返す', async () => {
    // CREDENTIAL_ERROR_CODES に含まれない code → インフラ障害扱い
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/internal-error', message: 'Firebase down' })

    const response = await POST(makeRequest({ idToken: 'valid-id-token' }))

    expect(response.status).toBe(503)
  })

  it('createSessionCookie が失敗した場合 503 を返す', async () => {
    mockVerifyIdToken.mockResolvedValue({} as never)
    mockCreateSessionCookie.mockRejectedValue(new Error('Firebase Auth down'))

    const response = await POST(makeRequest({ idToken: 'valid-id-token' }))

    expect(response.status).toBe(503)
  })
})
