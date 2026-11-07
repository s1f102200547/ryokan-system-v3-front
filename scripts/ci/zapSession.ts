// ZAP 段B（.zap/full-dev-auth.yaml）のための Session Cookie を、Auth Emulator と開発サーバーから取る。
// 出力は GITHUB_ENV に足す形（KEY=VALUE）。.github/workflows/zap-full.yml が使う。
// Emulator（127.0.0.1 / localhost・demo- の project）でなければ何もせずに失敗する。本番の Auth には接続しない
import { checkSeedTarget } from '../localdev/lib/guards'
import { DEV_USER_EMAIL, DEV_USER_PASSWORD } from '../localdev/constants'
import { getTodayJST } from '@/lib/dateUtils'

const APP = process.env.ZAP_TARGET ?? 'http://127.0.0.1:3000'

async function main(): Promise<void> {
  const target = checkSeedTarget(process.env)
  if (!target.success) {
    for (const e of target.error) console.error(e)
    process.exit(1)
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(APP)) {
    console.error('ZAP_TARGET はローカルの開発サーバーだけにする')
    process.exit(1)
  }

  // seed（npm run seed）が作る開発用ユーザーでログインする
  const signIn = await fetch(
    `http://${target.value.authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: DEV_USER_EMAIL, password: DEV_USER_PASSWORD, returnSecureToken: true }) },
  )
  const { idToken } = (await signIn.json()) as { idToken?: string }
  if (!signIn.ok || !idToken) throw new Error(`Auth Emulator へのログインに失敗: ${signIn.status}`)

  const login = await fetch(`${APP}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  })
  const cookie = login.headers.get('set-cookie')?.match(/(?:^|;\s*)session=([^;]+)/)?.[1]
  if (!login.ok || !cookie) throw new Error(`/api/auth/login に失敗: ${login.status}`)

  const today = getTodayJST()
  const [year, month] = today.split('-')
  console.log(`ZAP_SESSION=${cookie}`)
  console.log(`TODAY=${today}`)
  console.log(`YEAR=${year}`)
  console.log(`MONTH=${String(Number(month))}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
