// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { finalizePhoneMfa, startPhoneMfa } from '@/infra/auth/mfaSignIn'
import { InfraError } from '@/types/errors'

// 例外のメッセージ・cause に載せてはいけない値
const PENDING = 'pending-cred-must-not-leak-41b2'
const SESSION = 'session-info-must-not-leak-8d0c'
const CODE = '913274'
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

async function expectUnavailable(run: () => Promise<unknown>): Promise<InfraError> {
  const e: unknown = await run().then(() => null, (err: unknown) => err)
  expect(e).toBeInstanceOf(InfraError)
  const infra = e as InfraError
  expect(infra.code).toBe('AUTH_UNAVAILABLE')
  const text = `${infra.message} ${String(infra.cause)}`
  for (const secret of [PENDING, SESSION, CODE]) expect(text).not.toContain(secret)
  return infra
}

describe('startPhoneMfa', () => {
  const TOKEN = 'recaptcha-token-must-not-leak'
  const start = () => startPhoneMfa(PENDING, 'phone-1', null)
  const startWithToken = () => startPhoneMfa(PENDING, 'phone-1', TOKEN)

  it('reCAPTCHA Enterprise の token があれば、Web の Enterprise の token として添える', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ phoneResponseInfo: { sessionInfo: SESSION } }), { status: 200 }))
    expect(await startWithToken()).toEqual({ success: true, value: { sessionInfo: SESSION } })
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).phoneSignInInfo)
      .toEqual({ captchaResponse: TOKEN, clientType: 'CLIENT_TYPE_WEB', recaptchaVersion: 'RECAPTCHA_ENTERPRISE' })
  })

  it('token を断られたら recaptcha_rejected（利用者のブラウザが原因。障害にしない）', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 'INVALID_RECAPTCHA_TOKEN : localhost is not supported'))
    expect(await startWithToken()).toEqual({ success: false, error: { kind: 'recaptcha_rejected', code: 'INVALID_RECAPTCHA_TOKEN' } })
  })

  it('token を渡していないのに断られたら、設定の問題として AUTH_UNAVAILABLE（サイトキーの設定忘れ）', async () => {
    for (const message of ['INVALID_RECAPTCHA_TOKEN', 'MISSING_CLIENT_IDENTIFIER']) {
      fetchMock.mockResolvedValueOnce(errorResponse(400, message))
      await expectUnavailable(start)
    }
  })

  it('token は例外のメッセージにも入らない', async () => {
    fetchMock.mockResolvedValue(errorResponse(500, 'INTERNAL_ERROR'))
    const e = await expectUnavailable(startWithToken)
    expect(`${e.message} ${String(e.cause)}`).not.toContain(TOKEN)
  })

  it('v2 の mfaSignIn:start に、サーバーの API キーで送り、sessionInfo を返す', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ phoneResponseInfo: { sessionInfo: SESSION } }), { status: 200 }))
    expect(await start()).toEqual({ success: true, value: { sessionInfo: SESSION } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start?key=server-key')
    expect(JSON.parse(String(init.body))).toEqual({ mfaPendingCredential: PENDING, mfaEnrollmentId: 'phone-1', phoneSignInInfo: {} })
  })

  it('Emulator の接続先があれば Emulator に送る', async () => {
    vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099')
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ phoneResponseInfo: { sessionInfo: SESSION } }), { status: 200 }))
    await start()
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:start?key=demo-api-key')
  })

  it.each(['TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED'])('%s は throttled', async (message) => {
    fetchMock.mockResolvedValue(errorResponse(400, message))
    expect(await start()).toEqual({ success: false, error: { kind: 'throttled', code: message } })
  })

  // reCAPTCHA を求められたら設定の問題（docs/NormalOperationPlan.md のスパイク）
  it.each([
    ['reCAPTCHA の token がない', 400, 'MISSING_RECAPTCHA_TOKEN'],
    ['アプリの確認に失敗', 400, 'INVALID_APP_CREDENTIAL'],
    ['Firebase の障害', 503, 'UNAVAILABLE'],
  ])('%s は AUTH_UNAVAILABLE', async (_label, status, message) => {
    fetchMock.mockResolvedValue(errorResponse(status, message))
    expect((await expectUnavailable(start)).message).toBe(`MFA sign-in start failed: ${message} (status ${status})`)
  })

  it('sessionInfo のない成功・通信の失敗は AUTH_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    await expectUnavailable(start)
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    await expectUnavailable(start)
  })
})

describe('finalizePhoneMfa', () => {
  const finalize = () => finalizePhoneMfa(PENDING, SESSION, CODE)

  it('v2 の mfaSignIn:finalize にコードを送り、idToken を返す', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ idToken: 'id-token', refreshToken: 'r' }), { status: 200 }))
    expect(await finalize()).toEqual({ success: true, value: { idToken: 'id-token' } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://identitytoolkit.googleapis.com/v2/accounts/mfaSignIn:finalize?key=server-key')
    expect(JSON.parse(String(init.body))).toEqual({ mfaPendingCredential: PENDING, phoneVerificationInfo: { sessionInfo: SESSION, code: CODE } })
  })

  it.each([
    ['INVALID_CODE', 'invalid_code'],
    ['INVALID_VERIFICATION_CODE', 'invalid_code'],
    ['SESSION_EXPIRED', 'expired'],
    ['CODE_EXPIRED', 'expired'],
    ['INVALID_MFA_PENDING_CREDENTIAL', 'expired'],
    ['TOO_MANY_ATTEMPTS_TRY_LATER', 'throttled'],
  ])('%s は %s', async (message, kind) => {
    fetchMock.mockResolvedValue(errorResponse(400, `${message} : description`))
    expect(await finalize()).toEqual({ success: false, error: { kind, code: message } })
  })

  it('知らないエラー・idToken のない成功は AUTH_UNAVAILABLE', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'INTERNAL_ERROR'))
    expect((await expectUnavailable(finalize)).message).toBe('MFA sign-in finalize failed: INTERNAL_ERROR (status 500)')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ refreshToken: 'r' }), { status: 200 }))
    await expectUnavailable(finalize)
  })

  it('本番で API キーがなければ、送らずに AUTH_UNAVAILABLE', async () => {
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    await expectUnavailable(finalize)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
