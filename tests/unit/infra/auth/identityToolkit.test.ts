// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callIdentityToolkit, isIdentityToolkitConfigured } from '@/infra/auth/identityToolkit'
import { InfraError } from '@/types/errors'

// Identity Toolkit の REST を呼ぶ共通の部分（src/infra/auth/identityToolkit.ts。docs/MfaBugHunt.md の S9）。
// 応答の形を固定値で並べ、エラーコード・status・説明の文への分け方を確かめる。分けた後の振り分けは passwordSignIn・mfaSignIn のテスト

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '')
  vi.stubEnv('FIREBASE_AUTH_API_KEY', 'server-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const call = () => callIdentityToolkit('v2/accounts/mfaSignIn:finalize', { secret: 'must-not-leak' }, 'MFA sign-in finalize')
const errorBody = (message: unknown, status = 400) => new Response(JSON.stringify({ error: { code: status, message } }), { status })

describe('callIdentityToolkit の応答の分け方', () => {
  it.each<[string, Response, unknown]>([
    ['コードだけ', errorBody('INVALID_CODE'), { ok: false, code: 'INVALID_CODE', status: 400, description: '' }],
    ['コード : 説明', errorBody('INVALID_RECAPTCHA_TOKEN : localhost is not supported'), { ok: false, code: 'INVALID_RECAPTCHA_TOKEN', status: 400, description: 'localhost is not supported' }],
    ['コード: 説明（空白なし）', errorBody('QUOTA_EXCEEDED: try later'), { ok: false, code: 'QUOTA_EXCEEDED', status: 400, description: 'try later' }],
    ['コード :（説明が空）', errorBody('SESSION_EXPIRED :'), { ok: false, code: 'SESSION_EXPIRED', status: 400, description: '' }],
    ['空のメッセージ', errorBody(''), { ok: false, code: '', status: 400, description: '' }],
    ['メッセージが文字列でない', errorBody(42), { ok: false, code: 'UNKNOWN', status: 400, description: '' }],
    ['error がない JSON', new Response(JSON.stringify({ oops: true }), { status: 500 }), { ok: false, code: 'UNKNOWN', status: 500, description: '' }],
    ['JSON でない（Google の 502 の HTML）', new Response('<html>502 Bad Gateway</html>', { status: 502 }), { ok: false, code: 'UNKNOWN', status: 502, description: '' }],
    ['成功で JSON でない', new Response('not json', { status: 200 }), { ok: true, body: null }],
    ['成功', new Response(JSON.stringify({ idToken: 't' }), { status: 200 }), { ok: true, body: { idToken: 't' } }],
  ])('%s', async (_label, response, expected) => {
    fetchMock.mockResolvedValue(response)
    expect(await call()).toEqual(expected)
  })

  it('通信の失敗は AUTH_UNAVAILABLE（メッセージに body を入れない）', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const e: unknown = await call().then(() => null, (err: unknown) => err)
    expect(e).toBeInstanceOf(InfraError)
    expect((e as InfraError).code).toBe('AUTH_UNAVAILABLE')
    expect((e as InfraError).message).toBe('MFA sign-in finalize request failed')
    expect(String((e as InfraError).message)).not.toContain('must-not-leak')
  })

  it('10秒で打ち切る（AbortSignal を渡す）', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await call()
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
  })
})

describe('送り先', () => {
  it('本番: identitytoolkit.googleapis.com に、API キーを URL エンコードして付ける', async () => {
    vi.stubEnv('FIREBASE_AUTH_API_KEY', 'aaaa/aaaa+aaaa')
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await call()
    expect(fetchMock.mock.calls[0][0]).toBe('https://identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize?key=aaaa%2Faaaa%2Baaaa')
  })

  it('Emulator: API キーがなくても、Emulator にダミーのキーで送る', async () => {
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await call()
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize?key=demo-api-key')
  })

  it('API キーも Emulator もなければ、送らずに AUTH_UNAVAILABLE', async () => {
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    expect(isIdentityToolkitConfigured()).toBe(false)
    await expect(call()).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
