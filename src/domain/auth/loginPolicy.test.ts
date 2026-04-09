import { describe, it, expect, vi } from 'vitest'
import { login } from './loginPolicy'
import type { AuthProvider } from '@/domain/ports/authProvider'

// describe: 「login関数のテストですよ」というグループ化
describe('login', () => {
  it('正しい認証情報で成功する', async () => {
    // AuthProviderをすり替える
    const authProvider: AuthProvider = {
      // vi.fn() → 関数のモック + mockResolvedValue → 非同期で値を返す = 常に{ success: true, userId: 'user-1' }を返す
      authenticate: vi.fn().mockResolvedValue({ success: true, userId: 'user-1' }),
    }
    // モックを使って login() を実行
    const result = await login({ email: 'test@example.com', password: 'correct' }, authProvider)
    expect(result).toEqual({ success: true, value: { userId: 'user-1' } })
  })

  it('誤った認証情報で失敗する', async () => {
    const authProvider: AuthProvider = {
      authenticate: vi.fn().mockResolvedValue({ success: false }),
    }
    const result = await login({ email: 'test@example.com', password: 'wrong' }, authProvider)
    expect(result).toEqual({ success: false, error: 'invalid_credentials' })
  })
})
