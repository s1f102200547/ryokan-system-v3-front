import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/auth/login/route'

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
import { notifySlackFireAndForget } from '@/lib/slack'

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

  // request.json() を catch しておらず 500 になっていた
  it.each([
    ['不正な JSON', '{"idToken":'],
    ['空の body', ''],
  ])('%s で 400（Slack に通知しない）', async (_label, raw) => {
    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
    }))
    expect(response.status).toBe(400)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  // 形式が不正な idToken で 503 + ALERT になっていた。
  // firebase-admin は不正なトークンにも公開鍵の取得失敗にも auth/argument-error を返すため、メッセージで分ける
  // （メッセージは firebase-admin 13.10 が実際に返すもの）
  it.each([
    ['形式が不正', 'Decoding Firebase ID token failed. Make sure you passed the entire string JWT which represents an ID token.'],
    ['クレームが不正', 'Firebase ID token has incorrect "aud" (audience) claim. Expected "demo-x" but got "other".'],
    ['署名が不正', 'Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/admin/verify-id-tokens'],
  ])('auth/argument-error（%s）は 401（Slack に通知しない）', async (_label, message) => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message })
    const response = await POST(makeRequest({ idToken: 'x' }))
    expect(response.status).toBe(401)
    expect(notifySlackFireAndForget).not.toHaveBeenCalled()
  })

  it.each([
    ['HTTP エラー', 'Error fetching public keys for Google certs: 500'],
    ['接続できない', 'connect ETIMEDOUT 142.250.0.1:443'],
  ])('auth/argument-error でも公開鍵の取得失敗（%s）は 503 + Slack 通知', async (_label, message) => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/argument-error', message })
    const response = await POST(makeRequest({ idToken: 'x' }))
    expect(response.status).toBe(503)
    expect(notifySlackFireAndForget).toHaveBeenCalled()
  })
})
