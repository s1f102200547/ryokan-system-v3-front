import { adminAuth } from '@/lib/firebase/admin'
import { parseCookieValue } from '@/lib/api/routeHelpers'
import { firestoreMfaPendingRepository } from '@/infra/auth/firestoreMfaPendingRepository'
import { POST as LOGIN } from '@/app/api/auth/login/route'
import { POST as VERIFY } from '@/app/api/auth/login/verify/route'

// Auth Emulator で SMS の2要素目を通すための道具（tests/emulator/ から使う）。
// Emulator は SMS を送らず、コードを REST（/emulator/v1/projects/{id}/verificationCodes）で返す。reCAPTCHA も見ない

// Emulator 用の電話番号（555 は架空の番号の帯）
export const EMULATOR_MFA_PHONE = '+15555550100'

// ログインは旅館の PC（Windows）の Chrome・Edge だけ（src/lib/auth/clientCheck.ts）
export const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

// 電話を2要素目に登録したユーザーを作る（本番の scripts/mfa/enrollPhone.ts と同じ形）
export async function createMfaUser(email: string, password: string): Promise<string> {
  const user = await adminAuth.createUser({
    email,
    password,
    emailVerified: true,
    multiFactor: { enrolledFactors: [{ factorId: 'phone', phoneNumber: EMULATOR_MFA_PHONE, displayName: 'emutest' }] },
  })
  return user.uid
}

type Code = { phoneNumber?: string; sessionInfo?: string; code?: string }

// その SMS（sessionInfo）のコード。Emulator はこれまでに送ったすべてのコードを返す
export async function readEmulatorSmsCode(sessionInfo: string): Promise<string> {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/verificationCodes`)
  const body = (await res.json()) as { verificationCodes?: Code[] }
  const code = body.verificationCodes?.find((c) => c.sessionInfo === sessionInfo)?.code
  if (!code) throw new Error(`Emulator に SMS のコードがない（status ${res.status}）`)
  return code
}

type Headers = { userAgent?: string; forwardedFor?: string }

function headersOf({ userAgent = WINDOWS_CHROME, forwardedFor }: Headers, cookie?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'user-agent': userAgent,
    ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
    ...(cookie ? { cookie } : {}),
  }
}

// 1段目: パスワード → SMS。成功なら途中の状態の Cookie の値とコードも返す
export async function startLogin(email: string, password: string, headers: Headers = {}) {
  const res = await LOGIN(new Request('http://localhost/api/auth/login', {
    method: 'POST', headers: headersOf(headers), body: JSON.stringify({ email, password }),
  }))
  if (res.status !== 200) return { res, pendingId: null, code: null }
  const pendingId = parseCookieValue(res.headers.get('set-cookie')?.split(';')[0] ?? null, 'mfa_pending') ?? null
  const pending = pendingId ? await firestoreMfaPendingRepository.get(pendingId) : null
  if (!pendingId || !pending) throw new Error('途中の状態の Cookie か保存がない')
  return { res, pendingId, code: await readEmulatorSmsCode(pending.sessionInfo) }
}

// 2段目: コード → Session Cookie
export function verifyCode(pendingId: string, code: string, headers: Headers = {}) {
  return VERIFY(new Request('http://localhost/api/auth/login/verify', {
    method: 'POST', headers: headersOf(headers, `mfa_pending=${pendingId}`), body: JSON.stringify({ code }),
  }))
}

// 1段目と2段目を通し、2段目の応答を返す（1段目で断られたら1段目の応答）
export async function loginWithMfa(email: string, password: string, headers: Headers = {}): Promise<Response> {
  const started = await startLogin(email, password, headers)
  if (started.pendingId === null || started.code === null) return started.res
  return verifyCode(started.pendingId, started.code, headers)
}
