import type { Result } from '@/types/result'

// scripts/mfa/enrollPhone.ts の引数（純粋。tests/unit/scripts/enrollArgs.test.ts）
export type EnrollCommand =
  | { kind: 'list'; projectId: string }
  | { kind: 'enroll'; projectId: string; email: string; phoneNumber: string }
  | { kind: 'remove'; projectId: string; email: string }

export const USAGE = [
  '使い方:',
  '  npm run mfa:enroll -- --project <project ID> --list',
  '  npm run mfa:enroll -- --project <project ID> --email <PC のアカウント> --phone <+81 で始まる番号>',
  '  npm run mfa:enroll -- --project <project ID> --email <PC のアカウント> --remove',
].join('\n')

// E.164。本番の SMS は日本だけに送る設定にするので、+81 だけを受け付ける（Emulator では架空の +1 555 も使える）
const E164 = /^\+[1-9][0-9]{6,14}$/
const JAPAN = /^\+81[0-9]{9,10}$/

export function parseEnrollArgs(argv: readonly string[], { emulator }: { emulator: boolean }): Result<EnrollCommand, string> {
  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--list' || arg === '--remove') { flags.add(arg); continue }
    if (arg === '--project' || arg === '--email' || arg === '--phone') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) return { success: false, error: `${arg} の値がありません` }
      values.set(arg, value)
      i++
      continue
    }
    return { success: false, error: `知らない引数: ${arg}` }
  }

  const projectId = values.get('--project')
  if (!projectId) return { success: false, error: '--project を指定してください（取り違えを防ぐため、既定の project は使わない）' }
  if (emulator !== projectId.startsWith('demo-')) {
    return { success: false, error: emulator ? 'Emulator では demo- で始まる project だけ' : 'Emulator 以外では demo- の project は使えない' }
  }

  const email = values.get('--email')
  const phone = values.get('--phone')
  const modes = [flags.has('--list'), flags.has('--remove'), phone !== undefined].filter(Boolean).length
  if (modes !== 1) return { success: false, error: '--list・--phone・--remove のどれか1つを指定してください' }

  if (flags.has('--list')) {
    if (email !== undefined) return { success: false, error: '--list に --email は要りません' }
    return { success: true, value: { kind: 'list', projectId } }
  }
  if (!email) return { success: false, error: '--email を指定してください' }
  if (flags.has('--remove')) return { success: true, value: { kind: 'remove', projectId, email } }

  const phoneNumber = (phone ?? '').replace(/[\s-]/g, '')
  if (!E164.test(phoneNumber)) return { success: false, error: '電話番号は +81 で始まる形（例: +819012345678）で指定してください' }
  if (!emulator && !JAPAN.test(phoneNumber)) return { success: false, error: '本番では日本の番号（+81）だけ（SMS は日本だけに送る設定）' }
  return { success: true, value: { kind: 'enroll', projectId, email, phoneNumber } }
}

// 画面に出す電話番号は末尾4桁だけ（ターミナルの履歴・画面共有に残さない）
export function maskPhone(phoneNumber: string): string {
  return phoneNumber.length <= 4 ? '****' : `${'*'.repeat(phoneNumber.length - 4)}${phoneNumber.slice(-4)}`
}
