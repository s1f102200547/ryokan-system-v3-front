import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import type { LoginResult } from '@/types/auth'

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
    const result: LoginResult = { success: true, userId: 'user-1' }
    mockLoginCommand.mockResolvedValue(result)

    // リクエスト(自身のurlへのアクセス)をemail, passwordを乗せて実行
    const response = await POST(makeRequest({ email: 'test@example.com', password: 'correct' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('session=') // セッションにクッキーがセットされる
  })

  it('誤った認証情報で 401 と error が返る', async () => {
    const result: LoginResult = { success: false, reason: 'invalid_credentials' }
    mockLoginCommand.mockResolvedValue(result)

    const response = await POST(makeRequest({ email: 'test@example.com', password: 'wrong' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('invalid_credentials')
  })
})
