// ZAP 段B（.zap/full-dev-auth.yaml）のための Session Cookie を、Auth Emulator と開発サーバーから取る。
// 出力は GITHUB_ENV に足す形（KEY=VALUE）。.github/workflows/zap-full.yml が使う。
// Emulator（127.0.0.1 / localhost・demo- の project）でなければ何もせずに失敗する。本番の Auth には接続しない
import { checkSeedTarget } from '../localdev/lib/guards'
import { DEV_USER_EMAIL, DEV_USER_MFA_PHONE, DEV_USER_PASSWORD } from '../localdev/constants'
import { latestEmulatorSmsCode } from '../localdev/lib/emulatorSms'
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

  // seed（npm run seed）が作る開発用ユーザーでログインする。
  // 1段目: パスワード（開発サーバーが Auth Emulator に確かめ、SMS を送らせる）→ 2段目: Emulator の REST から読んだコード
  // ログインは旅館の PC（Windows）の Chrome・Edge だけ（src/lib/auth/clientCheck.ts）。Node の fetch の既定の User-Agent では断られる
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  const login = await fetch(`${APP}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({ email: DEV_USER_EMAIL, password: DEV_USER_PASSWORD }),
  })
  const pending = login.headers.get('set-cookie')?.match(/(?:^|;\s*|,\s*)mfa_pending=([^;]+)/)?.[1]
  if (!login.ok || !pending) throw new Error(`/api/auth/login に失敗: ${login.status}`)

  const code = await latestEmulatorSmsCode(target.value.authHost, target.value.projectId, DEV_USER_MFA_PHONE)
  if (code === null) throw new Error('Auth Emulator に SMS のコードがない')
  const verify = await fetch(`${APP}/api/auth/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-agent': userAgent, cookie: `mfa_pending=${pending}` },
    body: JSON.stringify({ code }),
  })
  const cookie = verify.headers.get('set-cookie')?.match(/(?:^|;\s*|,\s*)session=([^;]+)/)?.[1]
  if (!verify.ok || !cookie) throw new Error(`/api/auth/login/verify に失敗: ${verify.status}`)

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
