// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signInWithPassword } from '@/infra/auth/passwordSignIn'
import { InfraError } from '@/types/errors'

const PASSWORD = 'pw-must-not-leak-9f3a'
const fetchMock = vi.fn()

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: { code: status, message, errors: [{ message }] } }), { status })
}

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

// 例外が投げられるとき、メッセージにも cause にもパスワードが入っていないこと
async function expectUnavailable(): Promise<InfraError> {
  const e: unknown = await signInWithPassword('pc1@example.com', PASSWORD).then(() => null, (err: unknown) => err)
  expect(e).toBeInstanceOf(InfraError)
  const infra = e as InfraError
  expect(infra.code).toBe('AUTH_UNAVAILABLE')
  expect(`${infra.message} ${String(infra.cause)}`).not.toContain(PASSWORD)
  return infra
}

describe('signInWithPassword', () => {
  it('本番は identitytoolkit に、サーバーの API キーで、メールアドレスとパスワードを送る', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ idToken: 'id-token', localId: 'u1' }), { status: 200 }))
    expect(await signInWithPassword('pc1@example.com', PASSWORD)).toEqual({ success: true, value: { idToken: 'id-token' } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=server-key')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'pc1@example.com', password: PASSWORD, returnSecureToken: true })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('Emulator の接続先があれば Emulator に送り、API キーがなくてもダミーで送る（Emulator はキーを見ない）', async () => {
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ idToken: 't' }), { status: 200 }))
    await signInWithPassword('a@example.com', 'p')
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key')
  })

  it('本番で API キーがなければ、送らずに AUTH_UNAVAILABLE', async () => {
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    await expectUnavailable()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 本番はメールアドレスの列挙対策で INVALID_LOGIN_CREDENTIALS にまとまる。Emulator は INVALID_PASSWORD・EMAIL_NOT_FOUND（2026-11-11 確認）
  it.each(['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'USER_DISABLED', 'INVALID_EMAIL'])(
    '%s は invalid_credentials（数えて 401）', async (message) => {
      fetchMock.mockResolvedValue(errorResponse(400, message))
      expect(await signInWithPassword('a@example.com', PASSWORD)).toEqual({ success: false, error: 'invalid_credentials' })
    },
  )

  it.each([
    ['Firebase 自身の制限', 400, 'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled'],
    ['API キーの誤り', 400, 'API key not valid. Please pass a valid API key.'],
    ['API キーなし（Emulator は 403）', 403, 'The request is missing a valid API key.'],
    ['Firebase の障害', 503, 'UNAVAILABLE'],
  ])('%s は AUTH_UNAVAILABLE（503・Slack）', async (_label, status, message) => {
    fetchMock.mockResolvedValue(errorResponse(status, message))
    const e = await expectUnavailable()
    // 説明の文は載せず、先頭の語と status だけ
    expect(e.message).toBe(`Password sign-in failed: ${message.split(/[\s:]/, 1)[0]} (status ${status})`)
  })

  it('本文が JSON でない失敗は UNKNOWN の AUTH_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    expect((await expectUnavailable()).message).toBe('Password sign-in failed: UNKNOWN (status 502)')
  })

  it('idToken のない成功（2要素目が要る、など）は AUTH_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ mfaPendingCredential: 'x', mfaInfo: [] }), { status: 200 }))
    await expectUnavailable()
  })

  it('通信の失敗・タイムアウトは AUTH_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    await expectUnavailable()
  })
})
