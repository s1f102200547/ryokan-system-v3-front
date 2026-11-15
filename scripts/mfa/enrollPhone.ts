// PC のアカウントに、フロントの電話を SMS の2要素目として登録する（docs/Development.md「SMS の2要素目」）。
// 登録の画面は作らない。開発者が本番に対して実行する（AI エージェントは実行しない）。
// 認証は ADC（gcloud auth application-default login）。--project は必ず指定する（既定の project を使わない）。
// 書き込みの前に、対象の project とアカウントを表示して確認を求める
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { initializeApp } from 'firebase-admin/app'
import { getAuth, type UserRecord } from 'firebase-admin/auth'
import { maskPhone, parseEnrollArgs, USAGE } from './lib/enrollArgs'

const FACTOR_DISPLAY_NAME = 'フロントの電話'

function describe(user: UserRecord): string {
  const factors = user.multiFactor?.enrolledFactors ?? []
  const phones = factors.map((f) => ('phoneNumber' in f && typeof f.phoneNumber === 'string' ? maskPhone(f.phoneNumber) : f.factorId))
  return `${user.email ?? user.uid}  メール確認: ${user.emailVerified ? '済' : '未'}  2要素目: ${phones.length > 0 ? phones.join(', ') : 'なし'}${user.disabled ? '  （無効）' : ''}`
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(`${question} よければ yes と入力: `)).trim() === 'yes'
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  const parsed = parseEnrollArgs(process.argv.slice(2), { emulator })
  if (!parsed.success) {
    console.error(parsed.error)
    console.error(USAGE)
    process.exit(1)
  }
  const command = parsed.value
  const auth = getAuth(initializeApp({ projectId: command.projectId }))
  console.log(`project: ${command.projectId}${emulator ? `（Emulator ${process.env.FIREBASE_AUTH_EMULATOR_HOST}）` : ''}`)

  if (command.kind === 'list') {
    let pageToken: string | undefined
    do {
      const page = await auth.listUsers(1000, pageToken)
      for (const user of page.users) console.log(`  ${describe(user)}`)
      pageToken = page.pageToken
    } while (pageToken)
    return
  }

  const user = await auth.getUserByEmail(command.email)
  console.log(`今: ${describe(user)}`)

  if (command.kind === 'remove') {
    // 外すと、新しいコードではそのアカウントはログインできなくなる（mfa_not_enrolled）。電話をなくしたときの手順
    if (!(await confirm(`${command.email} の2要素目を外します。このアカウントはログインできなくなります。`))) return
    console.log(`後: ${describe(await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } }))}`)
    return
  }

  // enrolledFactors は丸ごと置き換える（電話は1台だけ）。メールアドレスの確認済みは2要素目の前提
  if (!(await confirm(`${command.email} の2要素目を ${maskPhone(command.phoneNumber)} にします（今の登録は置き換わります）。`))) return
  // 本番は登録の ID（uid）を省けば Auth が作る（公式の手順）。Emulator は省くと auth/internal-error（mfaEnrollmentId must be defined）
  // になるので、Emulator のときだけこちらで作る（2026-11-12 に確認）
  const updated = await auth.updateUser(user.uid, {
    emailVerified: true,
    multiFactor: {
      enrolledFactors: [{
        factorId: 'phone', phoneNumber: command.phoneNumber, displayName: FACTOR_DISPLAY_NAME, ...(emulator ? { uid: randomUUID() } : {}),
      }],
    },
  })
  console.log(`後: ${describe(updated)}`)
}

main().catch((e: unknown) => {
  // メッセージだけ（電話番号は載せない）
  const code = (e as { code?: unknown } | null)?.code
  console.error(typeof code === 'string' ? `失敗: ${code}` : `失敗: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
