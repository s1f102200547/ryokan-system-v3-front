import { describe, it, expect } from 'vitest'
import { isInvalidIdTokenError } from '@/lib/auth/idTokenError'

// メッセージは firebase-admin 14.5 が実際に返すもの
describe('isInvalidIdTokenError', () => {
  it.each([
    ['期限切れ', { code: 'auth/id-token-expired', message: 'x' }],
    ['失効', { code: 'auth/id-token-revoked', message: 'x' }],
    ['無効', { code: 'auth/invalid-id-token', message: 'x' }],
    ['無効化されたユーザー', { code: 'auth/user-disabled', message: 'x' }],
    ['形式が不正', { code: 'auth/argument-error', message: 'Decoding Firebase ID token failed. Make sure you passed the entire string JWT.' }],
    ['クレームが不正', { code: 'auth/argument-error', message: 'Firebase ID token has incorrect "aud" (audience) claim.' }],
    ['署名が不正', { code: 'auth/argument-error', message: 'Firebase ID token has invalid signature.' }],
  ])('%s はトークンの不正（401）', (_label, e) => {
    expect(isInvalidIdTokenError(e)).toBe(true)
  })

  it.each([
    ['公開鍵の取得失敗（HTTP）', { code: 'auth/argument-error', message: 'Error fetching public keys for Google certs: 500' }],
    ['公開鍵の取得失敗（接続）', { code: 'auth/argument-error', message: 'connect ETIMEDOUT 142.250.0.1:443' }],
    ['公開鍵の取得失敗（名前解決）', { code: 'auth/argument-error', message: 'Error while making request: getaddrinfo ENOTFOUND www.googleapis.com. Error code: ENOTFOUND' }],
    ['message なし', { code: 'auth/argument-error' }],
    ['内部エラー', { code: 'auth/internal-error', message: 'x' }],
    ['code なし', new Error('boom')],
    ['null', null],
  ])('%s は障害（503）', (_label, e) => {
    expect(isInvalidIdTokenError(e)).toBe(false)
  })
})
