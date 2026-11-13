// スパイク（使い捨て）: 本物の Identity Platform の mfaSignIn:start が、reCAPTCHA の token なしで SMS を送るかを確かめる
// （docs/NormalOperationPlan.md の 2・3）。テスト用の GCP プロジェクトにだけ向ける。本番には向けない。
//
//   (a) API キーだけ（今のコードと同じ）
//   (b) ADC（gcloud auth application-default login）の Bearer トークン
//
// 使い方（値はシェルの環境変数で渡す。ファイルに書かない・会話に貼らない）:
//   export SPIKE_API_KEY=...  SPIKE_EMAIL=...  SPIKE_PASSWORD=...
//   npm run spike:mfa -- --project <テスト用の project ID>
//
// 出すのは結果・エラーコード・時刻だけ。API キー・トークン・mfaPendingCredential・sessionInfo・電話番号は出さない。
// 電話を2要素目に登録したユーザーが要る（npm run mfa:enroll）。成功すると、登録した電話に SMS が最大2通届く
import { applicationDefault } from 'firebase-admin/app'

const BLOCKED_PROJECTS = new Set(['ryokan-system']) // 本番
const BASE = 'https://identitytoolkit.googleapis.com'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parseProject(argv: string[]): string {
  const i = argv.indexOf('--project')
  const project = i >= 0 ? argv[i + 1] : undefined
  if (!project || project.startsWith('--')) fail('--project <テスト用の project ID> を指定してください')
  if (BLOCKED_PROJECTS.has(project)) fail('本番のプロジェクトには向けない')
  if (project.startsWith('demo-')) fail('demo- は Emulator 用。本物のテスト用プロジェクトを指定してください')
  return project
}

// "TOO_MANY_ATTEMPTS_TRY_LATER : ..." の先頭の語だけ
function errorCode(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message
  return typeof message === 'string' ? (message.split(/[\s:]/, 1)[0] ?? 'UNKNOWN') : 'UNKNOWN'
}

// Google の説明の文（コードの後ろ）。原因の切り分けに使う。秘密の値は入らない
function describeError(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message
  if (typeof message !== 'string') return ''
  const rest = message.slice(errorCode(body).length).replace(/^[\s:]+/, '')
  return rest ? `\n    説明: ${rest.slice(0, 300)}` : ''
}

async function post(url: string, payload: object, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown }
}

const time = () => new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })

// パスワードを確かめ、2要素目に進むための値を得る
async function signIn(apiKey: string, email: string, password: string) {
  const { status, body } = await post(`${BASE}/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, { email, password, returnSecureToken: true })
  if (status !== 200) fail(`パスワードの確認に失敗: ${errorCode(body)}（status ${status}）`)
  const b = body as { idToken?: unknown; mfaPendingCredential?: unknown; mfaInfo?: { mfaEnrollmentId?: unknown; phoneInfo?: unknown }[] }
  if (typeof b.idToken === 'string') fail('2要素目なしで通った = 電話が登録されていない。npm run mfa:enroll で登録してから実行してください')
  const phone = b.mfaInfo?.find((m) => typeof m.phoneInfo === 'string')
  if (typeof b.mfaPendingCredential !== 'string' || typeof phone?.mfaEnrollmentId !== 'string') fail('応答に mfaPendingCredential か電話の登録がない')
  return { mfaPendingCredential: b.mfaPendingCredential, mfaEnrollmentId: phone.mfaEnrollmentId }
}

async function tryStart(label: string, url: string, pending: { mfaPendingCredential: string; mfaEnrollmentId: string }, headers: Record<string, string> = {}) {
  const sentAt = time()
  const { status, body } = await post(url, { ...pending, phoneSignInInfo: {} }, headers)
  const ok = status === 200 && typeof (body as { phoneResponseInfo?: { sessionInfo?: unknown } } | null)?.phoneResponseInfo?.sessionInfo === 'string'
  console.log(ok
    ? `${label}: 通った（${sentAt} に SMS を頼んだ。届いた時刻を見てください）`
    : `${label}: 断られた: ${errorCode(body)}（status ${status}）${describeError(body)}`)
  return ok
}

async function main() {
  const project = parseProject(process.argv.slice(2))
  for (const name of Object.keys(process.env)) if (name.endsWith('_EMULATOR_HOST')) fail(`${name} がある（Emulator ではなく本物に向けるスパイク）`)
  const apiKey = process.env.SPIKE_API_KEY
  const email = process.env.SPIKE_EMAIL
  const password = process.env.SPIKE_PASSWORD
  if (!apiKey || !email || !password) fail('SPIKE_API_KEY・SPIKE_EMAIL・SPIKE_PASSWORD を環境変数で渡してください')
  console.log(`project: ${project}`)

  // (a) API キーだけ
  await tryStart('(a) API キーだけ', `${BASE}/v2/accounts/mfaSignIn:start?key=${encodeURIComponent(apiKey)}`, await signIn(apiKey, email, password))

  // (b) ADC の Bearer トークン。mfaPendingCredential は使い回さず、パスワードからやり直す
  let accessToken: string
  try {
    accessToken = (await applicationDefault().getAccessToken()).access_token
  } catch {
    fail('(b) ADC のトークンが取れない（gcloud auth application-default login を実行してください）')
  }
  await tryStart('(b) Bearer トークン', `${BASE}/v2/accounts/mfaSignIn:start`, await signIn(apiKey, email, password), {
    Authorization: `Bearer ${accessToken}`,
    'x-goog-user-project': project,
  })
}

main().catch((e: unknown) => fail(`失敗: ${e instanceof Error ? e.name : 'UNKNOWN'}`))
