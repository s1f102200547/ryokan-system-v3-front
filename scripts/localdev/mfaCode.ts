// 開発用ユーザーのログインの2段目（SMS のコード）を表示する（make mfa-code）。
// Emulator は SMS を送らないので、ログイン画面で「ログイン」を押した後にこれを実行し、出たコードを入れる。
// Emulator（127.0.0.1 / localhost・demo- の project）でなければ何もせずに失敗する
import { checkSeedTarget } from './lib/guards'
import { latestEmulatorSmsCode } from './lib/emulatorSms'
import { DEV_USER_MFA_PHONE } from './constants'

async function main(): Promise<void> {
  const target = checkSeedTarget(process.env)
  if (!target.success) {
    for (const e of target.error) console.error(e)
    process.exit(1)
  }
  const { authHost, projectId } = target.value
  const code = await latestEmulatorSmsCode(authHost, projectId, DEV_USER_MFA_PHONE)
  if (code === null) {
    console.error(`使えるコードがありません（${DEV_USER_MFA_PHONE}）。ログイン画面でメールアドレスとパスワードを送ってから実行してください（使ったコードは消えます）`)
    process.exit(1)
  }
  console.log(code)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
