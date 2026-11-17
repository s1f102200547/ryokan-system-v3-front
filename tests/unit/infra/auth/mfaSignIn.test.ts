// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { finalizePhoneMfa, startPhoneMfa } from '@/infra/auth/mfaSignIn'
import { describeError } from '@/infra/auth/identityToolkit'
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

  // 説明の文で、ドメインの許可漏れ・キーの取り違えなどを見分ける（2026-11-15 の本番で、コードだけでは絞れなかった）
  it('token を断られたら recaptcha_rejected（利用者のブラウザが原因。障害にしない）。Google の説明の文も返す', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 'INVALID_RECAPTCHA_TOKEN : localhost is not supported'))
    expect(await startWithToken()).toEqual({
      success: false, error: { kind: 'recaptcha_rejected', code: 'INVALID_RECAPTCHA_TOKEN', description: 'localhost is not supported' },
    })
  })

  // 公式のトラブルシューティング（Identity Platform の reCAPTCHA）が、点数が低くて断ったときに挙げるコード
  it('点数が低くて断られたら（CAPTCHA_CHECK_FAILED）recaptcha_rejected（503・[ALERT] にしない）', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 'CAPTCHA_CHECK_FAILED'))
    expect(await startWithToken()).toEqual({ success: false, error: { kind: 'recaptcha_rejected', code: 'CAPTCHA_CHECK_FAILED', description: '' } })
  })

  it('token を渡していないのに断られたら、設定の問題として AUTH_UNAVAILABLE（サイトキーの設定忘れ）', async () => {
    for (const message of ['INVALID_RECAPTCHA_TOKEN', 'CAPTCHA_CHECK_FAILED', 'MISSING_CLIENT_IDENTIFIER']) {
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

  it('振り分けにないコードは、例外のメッセージ（[ALERT]）に説明の文も付ける', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, 'OPERATION_NOT_ALLOWED : SMS unable to be sent until this region enabled'))
    expect((await expectUnavailable(start)).message)
      .toBe('MFA sign-in start failed: OPERATION_NOT_ALLOWED (status 400) - SMS unable to be sent until this region enabled')
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
    fetchMock.mockResolvedValueOnce(errorResponse(400, 'SOMETHING_NEW : the verification is not valid'))
    expect((await expectUnavailable(finalize)).message).toBe('MFA sign-in finalize failed: SOMETHING_NEW (status 400) - the verification is not valid')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ refreshToken: 'r' }), { status: 200 }))
    await expectUnavailable(finalize)
  })

  it('本番で API キーがなければ、送らずに AUTH_UNAVAILABLE', async () => {
    vi.stubEnv('FIREBASE_AUTH_API_KEY', '')
    await expectUnavailable(finalize)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// Google の説明の文。原因の切り分けに載せるが、値が混ざっても漏らさない
describe('describeError', () => {
  it('コードの後ろの説明の文だけ（コードだけなら空）', () => {
    expect(describeError('INVALID_RECAPTCHA_TOKEN : localhost is not supported')).toBe('localhost is not supported')
    expect(describeError('CAPTCHA_CHECK_FAILED')).toBe('')
  })

  it('電話番号・SMS のコード（6桁以上の数字）と、token・キー（32文字以上）は伏せる', () => {
    expect(describeError('X : phone +81 90-1234-5678 code 913274 ok')).toBe('phone […] code […] ok')
    expect(describeError(`X : token ${'a'.repeat(40)} key test-site-key-000000000000000000000000000`)).toBe('token […] key […]')
    expect(describeError('X : 5 attempts in 300 seconds')).toBe('5 attempts in 300 seconds') // 短い数字は残す
  })

  it('200 文字で切る', () => {
    expect(describeError(`X : ${'word '.repeat(100)}`)).toHaveLength(200)
  })
})
