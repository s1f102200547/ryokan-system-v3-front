import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import type { LoginResult } from '@/types/auth'
import { InfraError } from '@/types/errors'

vi.mock('@/application/auth/loginCommand')
import { loginCommand } from '@/application/auth/loginCommand'

// //FIrebaseの外部アクセスをしたくないのでlogingCommand(application層)から下(dmain, infra)は使わない
// 「こういう結果が返ってくる」と強制的に決める
const mockLoginCommand = vi.mocked(loginCommand) 

// リクエスト(自身のurlへのアクセス)を生成
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

  it('正しい認証情報で 200 と session Cookie が返る', async () => {

    // 「成功のレスポンスが返ってくる」と強制的に決める
    const result: LoginResult = { success: true, value: { userId: 'user-1' } }
    mockLoginCommand.mockResolvedValue(result)

    // リクエスト(自身のurlへのアクセス)をemail, passwordを乗せて実行
    const response = await POST(makeRequest({ email: 'test@example.com', password: 'correct' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('session=') // セッションにクッキーがセットされる
  })

  it('誤った認証情報で 401 と error が返る', async () => {
    const result: LoginResult = { success: false, error: 'invalid_credentials' }
    mockLoginCommand.mockResolvedValue(result)

    const response = await POST(makeRequest({ email: 'test@example.com', password: 'wrong' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('invalid_credentials')
  })

  it('email が不正な形式の場合 400 が返る', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email', password: 'password' }))

    expect(response.status).toBe(400)
  })

  it('password が空文字の場合 400 が返る', async () => {
    const response = await POST(makeRequest({ email: 'test@example.com', password: '' }))

    expect(response.status).toBe(400)
  })

  it('AUTH_UNAVAILABLE の場合 503 が返る', async () => {
    mockLoginCommand.mockRejectedValue(new InfraError('AUTH_UNAVAILABLE', 'Firebase Auth down'))

    const response = await POST(makeRequest({ email: 'test@example.com', password: 'pw' }))

    expect(response.status).toBe(503)
  })

  it('想定外の(定義していない)エラーの場合 500 が返る', async () => {
    mockLoginCommand.mockRejectedValue(new Error('unexpected'))

    const response = await POST(makeRequest({ email: 'test@example.com', password: 'pw' }))

    expect(response.status).toBe(500)
  })
})
