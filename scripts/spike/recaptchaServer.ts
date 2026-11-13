// スパイク（使い捨て）: ブラウザで作った reCAPTCHA の token を添えれば、mfaSignIn:start が SMS を送るかを確かめる
// （docs/NormalOperationPlan.md の 3）。テスト用の GCP プロジェクトにだけ向ける。本番には向けない。
//
// 使い方（値はシェルの環境変数で渡す。ファイルに書かない・会話に貼らない）:
//   export SPIKE_API_KEY=...  SPIKE_EMAIL=...  SPIKE_PASSWORD=...
//   npm run spike:recaptcha -- --project <テスト用の project ID>
//   （Identity Platform からサイトキーを取れないときは SPIKE_SITE_KEY=<コンソールのサイトキー> も渡す）
//   → ブラウザで http://localhost:8099 を開き、ボタンを押す（localhost を Identity Platform の承認済みドメインに入れておく）
//
// 画面とターミナルに出すのは、結果・エラーコード・Google の説明の文だけ。キー・token・mfaPendingCredential は出さない
import { createServer } from 'node:http'

const PORT = 8099
const BASE = 'https://identitytoolkit.googleapis.com'
const BLOCKED_PROJECTS = new Set(['ryokan-system']) // 本番

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const argv = process.argv.slice(2)
const project = argv[argv.indexOf('--project') + 1]
if (argv.indexOf('--project') < 0 || !project || project.startsWith('--')) fail('--project <テスト用の project ID> を指定してください')
if (BLOCKED_PROJECTS.has(project) || project.startsWith('demo-')) fail('テスト用の本物のプロジェクトだけ（本番・demo- は不可）')
for (const name of Object.keys(process.env)) if (name.endsWith('_EMULATOR_HOST')) fail(`${name} がある（本物に向けるスパイク）`)
const apiKey = process.env.SPIKE_API_KEY ?? fail('SPIKE_API_KEY を環境変数で渡してください')
const email = process.env.SPIKE_EMAIL ?? fail('SPIKE_EMAIL を環境変数で渡してください')
const password = process.env.SPIKE_PASSWORD ?? fail('SPIKE_PASSWORD を環境変数で渡してください')
const key = `key=${encodeURIComponent(apiKey)}`

type Json = Record<string, unknown>

async function call(method: 'GET' | 'POST', path: string, payload?: object): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${BASE}/${path}${path.includes('?') ? '&' : '?'}${key}`, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, body: ((await res.json().catch(() => null)) ?? {}) as Json }
}

// "OPERATION_NOT_ALLOWED : SMS unable to ..." → コードと説明
function describe(body: Json): { code: string; description: string } {
  const message = (body.error as { message?: unknown } | undefined)?.message
  if (typeof message !== 'string') return { code: 'UNKNOWN', description: '' }
  const code = message.split(/[\s:]/, 1)[0] ?? 'UNKNOWN'
  return { code, description: message.slice(code.length).replace(/^[\s:]+/, '').slice(0, 300) }
}

// サイトキー（ブラウザに渡してよい公開の値）
async function siteKeys(): Promise<{ enterprise: string | null; enterpriseState: unknown; v2: string | null }> {
  const ent = await call('GET', 'v2/recaptchaConfig?clientType=CLIENT_TYPE_WEB&version=RECAPTCHA_ENTERPRISE')
  const recaptchaKey = typeof ent.body.recaptchaKey === 'string' ? ent.body.recaptchaKey : null
  const v2 = await call('GET', 'v1/recaptchaParams')
  // Identity Platform からサイトキーを取れないときに、コンソールで見たサイトキー（公開の値）を指定できる
  const override = process.env.SPIKE_SITE_KEY || null
  return {
    enterprise: override ?? (recaptchaKey ? (recaptchaKey.split('/').at(-1) ?? null) : null),
    enterpriseState: ent.body.recaptchaEnforcementState ?? describe(ent.body),
    v2: typeof v2.body.recaptchaSiteKey === 'string' ? v2.body.recaptchaSiteKey : null,
  }
}

async function trySend(version: 'enterprise' | 'v2', token: string) {
  const signIn = await call('POST', 'v1/accounts:signInWithPassword', { email, password, returnSecureToken: true })
  if (signIn.status !== 200) return { sent: false, step: 'パスワード', ...describe(signIn.body) }
  const info = (signIn.body.mfaInfo as { mfaEnrollmentId?: unknown; phoneInfo?: unknown }[] | undefined)?.find((m) => typeof m.phoneInfo === 'string')
  if (typeof signIn.body.mfaPendingCredential !== 'string' || typeof info?.mfaEnrollmentId !== 'string') {
    return { sent: false, step: 'パスワード', code: 'NO_PHONE_FACTOR', description: '電話が2要素目に登録されていない' }
  }
  const phoneSignInInfo = version === 'enterprise'
    ? { captchaResponse: token, clientType: 'CLIENT_TYPE_WEB', recaptchaVersion: 'RECAPTCHA_ENTERPRISE' }
    : { recaptchaToken: token }
  const startedAt = new Date().toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })
  const start = await call('POST', 'v2/accounts/mfaSignIn:start', {
    mfaPendingCredential: signIn.body.mfaPendingCredential, mfaEnrollmentId: info.mfaEnrollmentId, phoneSignInInfo,
  })
  const sent = start.status === 200 && typeof (start.body.phoneResponseInfo as { sessionInfo?: unknown } | undefined)?.sessionInfo === 'string'
  return sent ? { sent, step: 'SMS', startedAt } : { sent, step: 'SMS', startedAt, ...describe(start.body) }
}

function page(keys: Awaited<ReturnType<typeof siteKeys>>): string {
  return `<!doctype html><meta charset="utf-8"><title>reCAPTCHA spike</title>
<body style="font-family:sans-serif;max-width:640px;margin:2em auto">
<h1>reCAPTCHA spike</h1>
<p>Enterprise のサイトキー: ${keys.enterprise ? 'あり' : 'なし'} / v2 のサイトキー: ${keys.v2 ? 'あり' : 'なし'}</p>
<button id="ent" ${keys.enterprise ? '' : 'disabled'}>Enterprise の token で SMS を頼む</button>
<button id="v2" ${keys.v2 ? '' : 'disabled'}>v2 の token で SMS を頼む</button>
<div id="v2box"></div>
<pre id="out"></pre>
<script>
const ENT = ${JSON.stringify(keys.enterprise)}, V2 = ${JSON.stringify(keys.v2)}
const out = (t) => { document.getElementById('out').textContent += t + '\\n' }
const load = (src) => new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ng; document.head.append(s) })
async function send(version, token) {
  out(version + ': token を作った（' + token.length + ' 文字）。SMS を頼む…')
  const r = await fetch('/try', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, token }) })
  out(version + ': ' + JSON.stringify(await r.json()))
}
document.getElementById('ent').onclick = async () => {
  try {
    if (!window.grecaptcha?.enterprise) await load('https://www.google.com/recaptcha/enterprise.js?render=' + ENT)
    grecaptcha.enterprise.ready(async () => send('enterprise', await grecaptcha.enterprise.execute(ENT, { action: 'mfaSmsSignIn' })))
  } catch (e) { out('enterprise: 読み込みに失敗: ' + e) }
}
document.getElementById('v2').onclick = async () => {
  try {
    if (!window.grecaptcha?.render) await load('https://www.google.com/recaptcha/api.js?render=explicit')
    grecaptcha.ready(() => {
      const id = grecaptcha.render('v2box', { sitekey: V2, size: 'invisible', callback: (t) => send('v2', t) })
      grecaptcha.execute(id)
    })
  } catch (e) { out('v2: 読み込みに失敗: ' + e) }
}
</script>`
}

async function main() {
  const keys = await siteKeys()
  console.log(`project: ${project}`)
  console.log(`Enterprise のサイトキー: ${keys.enterprise ? 'あり' : 'なし'}${process.env.SPIKE_SITE_KEY ? '（SPIKE_SITE_KEY で指定）' : ''}（Identity Platform の応答: ${JSON.stringify(keys.enterpriseState)}）`)
  console.log(`v2 のサイトキー: ${keys.v2 ? 'あり' : 'なし'}`)

  createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page(keys))
      return
    }
    if (req.method === 'POST' && req.url === '/try') {
      let raw = ''
      req.on('data', (c: Buffer) => { raw += c.toString() })
      req.on('end', () => {
        void (async () => {
          const { version, token } = JSON.parse(raw) as { version: 'enterprise' | 'v2'; token: string }
          const result = await trySend(version, token).catch((e: unknown) => ({ sent: false, step: '通信', code: e instanceof Error ? e.name : 'UNKNOWN', description: '' }))
          console.log(`${version}: ${JSON.stringify(result)}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        })()
      })
      return
    }
    res.writeHead(404).end()
  }).listen(PORT, '127.0.0.1', () => console.log(`ブラウザで http://localtest.me:${PORT} を開いてください（localhost で作った token は Identity Platform が受け付けない。Ctrl+C で止める）`))
}

main().catch((e: unknown) => fail(`失敗: ${e instanceof Error ? e.message : String(e)}`))
