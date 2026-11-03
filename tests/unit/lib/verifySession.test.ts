// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InfraError } from '@/types/errors'

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { verifySessionCookie: vi.fn() }, adminDb: {} }))
import { adminAuth } from '@/lib/firebase/admin'
import { verifySession } from '@/lib/auth/verifySession'

// auth/ で始まるコードをすべて「未ログイン」にしていた。
// Auth の内部障害でもログイン画面に戻され、通知されなかった。メッセージは firebase-admin 13.10 が実際に返すもの
describe('verifySession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Cookie がなければ null（未ログイン）', async () => {
    expect(await verifySession(undefined)).toBeNull()
  })

  it('有効な Cookie なら uid', async () => {
    vi.mocked(adminAuth.verifySessionCookie).mockResolvedValue({ uid: 'u1' } as never)
    expect(await verifySession('cookie')).toEqual({ uid: 'u1' })
  })

  it.each([
    ['期限切れ', { code: 'auth/session-cookie-expired', message: 'Firebase session cookie has expired.' }],
    ['失効', { code: 'auth/session-cookie-revoked', message: 'x' }],
    ['無効化されたユーザー', { code: 'auth/user-disabled', message: 'x' }],
    ['削除されたユーザー', { code: 'auth/user-not-found', message: 'x' }],
    ['形式が不正', { code: 'auth/argument-error', message: 'Decoding Firebase session cookie failed. Make sure you passed the entire string JWT.' }],
    ['クレームが不正', { code: 'auth/argument-error', message: 'Firebase session cookie has incorrect "aud" (audience) claim.' }],
  ])('%s は null（未ログイン → 401）', async (_label, e) => {
    vi.mocked(adminAuth.verifySessionCookie).mockRejectedValue(e)
    expect(await verifySession('cookie')).toBeNull()
  })

  it.each([
    ['Auth に接続できない', { code: 'app/network-error', message: 'Error while making request: connect ECONNREFUSED 127.0.0.1:9099.' }],
    ['Auth の内部エラー', { code: 'auth/internal-error', message: 'x' }],
    ['公開鍵の取得失敗', { code: 'auth/argument-error', message: 'Error fetching public keys for Google certs: 500' }],
    ['code なし', new Error('boom')],
  ])('%s は AUTH_UNAVAILABLE（障害 → 503 + 通知）', async (_label, e) => {
    vi.mocked(adminAuth.verifySessionCookie).mockRejectedValue(e)
    await expect(verifySession('cookie')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    await expect(verifySession('cookie')).rejects.toBeInstanceOf(InfraError)
  })
})
