// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InfraError } from '@/types/errors'

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { verifySessionCookie: vi.fn(), getUser: vi.fn() }, adminDb: {} }))
import { adminAuth } from '@/lib/firebase/admin'
import { verifySession } from '@/lib/auth/verifySession'

// auth/ で始まるコードをすべて「未ログイン」にしていた。
// Auth の内部障害でもログイン画面に戻され、通知されなかった。メッセージは firebase-admin 14.5 が実際に返すもの
describe('verifySession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 1アカウント1セッション: 最後のログインの時刻（クレーム）と Cookie の auth_time が一致する、が既定
    vi.mocked(adminAuth.getUser).mockResolvedValue({ customClaims: { sessionAuthTime: 100 } } as never)
  })

  it('Cookie がなければ null（未ログイン）', async () => {
    expect(await verifySession(undefined)).toBeNull()
  })

  it('有効な Cookie なら uid', async () => {
    vi.mocked(adminAuth.verifySessionCookie).mockResolvedValue({ uid: 'u1', auth_time: 100 } as never)
    expect(await verifySession('cookie')).toEqual({ uid: 'u1' })
  })

  // 第2引数（checkRevoked）がないと、失効させた Cookie や無効化・削除したユーザーの Cookie が期限まで通る
  it('失効の確認つきで検証する', async () => {
    vi.mocked(adminAuth.verifySessionCookie).mockResolvedValue({ uid: 'u1', auth_time: 100 } as never)
    await verifySession('cookie')
    expect(adminAuth.verifySessionCookie).toHaveBeenCalledWith('cookie', true)
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
    ['公開鍵の取得失敗（名前解決）', { code: 'auth/argument-error', message: 'Error while making request: getaddrinfo ENOTFOUND www.googleapis.com. Error code: ENOTFOUND' }],
    ['code なし', new Error('boom')],
  ])('%s は AUTH_UNAVAILABLE（障害 → 503 + 通知）', async (_label, e) => {
    vi.mocked(adminAuth.verifySessionCookie).mockRejectedValue(e)
    await expect(verifySession('cookie')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    await expect(verifySession('cookie')).rejects.toBeInstanceOf(InfraError)
  })

  // 新しいログインがあると、ログイン API がクレームを新しい時刻に書き換える。前のセッションの Cookie は時刻が合わなくなる
  describe('1アカウント1セッション', () => {
    beforeEach(() => {
      vi.mocked(adminAuth.verifySessionCookie).mockResolvedValue({ uid: 'u1', auth_time: 100 } as never)
    })

    it('Cookie のログインの時刻とクレームが一致すれば uid（クレームはその uid のユーザーから読む）', async () => {
      expect(await verifySession('cookie')).toEqual({ uid: 'u1' })
      expect(adminAuth.getUser).toHaveBeenCalledWith('u1')
    })

    it.each([
      ['あとから別のログインがあった', { sessionAuthTime: 200 }],
      ['クレームがない（この仕組みの前のログイン）', undefined],
      ['クレームに別の値だけがある', { other: true }],
      ['時刻が文字列', { sessionAuthTime: '100' }],
    ])('%s は null（未ログイン → 401）', async (_label, customClaims) => {
      vi.mocked(adminAuth.getUser).mockResolvedValue({ customClaims } as never)
      expect(await verifySession('cookie')).toBeNull()
    })

    it('getUser でユーザーが見つからなければ null', async () => {
      vi.mocked(adminAuth.getUser).mockRejectedValue({ code: 'auth/user-not-found', message: 'x' })
      expect(await verifySession('cookie')).toBeNull()
    })

    it('getUser の障害は AUTH_UNAVAILABLE', async () => {
      vi.mocked(adminAuth.getUser).mockRejectedValue({ code: 'app/network-error', message: 'connect ECONNREFUSED' })
      await expect(verifySession('cookie')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    })
  })
})
