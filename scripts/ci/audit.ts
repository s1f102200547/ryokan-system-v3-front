// npm audit を実行し、high 以上のうち例外リスト（auditAllowlist.ts）にないものがあれば失敗する
//   npm run audit:ci
// npm audit --audit-level=high の代わりに CI で使う。新しい high / critical が出れば従来どおり CI は失敗する
import { spawnSync } from 'node:child_process'
import { AUDIT_ALLOWLIST } from './auditAllowlist'
import { collectFindings, decide } from './auditPolicy'
import type { AuditFinding, AuditReport } from './auditPolicy'

function getTodayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function runNpmAudit(): AuditReport {
  // 脆弱性があると npm audit は exit code 1 を返すので、終了コードではなく JSON で判定する
  const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    throw new Error(`npm audit の出力を JSON として読めませんでした: ${result.stderr || result.stdout}`)
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('npm audit の出力が不正です')
  if ('error' in parsed) throw new Error(`npm audit が失敗しました: ${JSON.stringify(parsed.error)}`)
  return parsed as AuditReport
}

function format(f: AuditFinding): string {
  return `  - [${f.severity}] ${f.package} ${f.id}: ${f.title} (${f.url})`
}

function main(): void {
  const decision = decide(collectFindings(runNpmAudit()), AUDIT_ALLOWLIST, getTodayJST())

  if (decision.allowed.length > 0) {
    console.log(`例外リストで許可した high 以上の脆弱性: ${decision.allowed.length}件`)
    decision.allowed.forEach((f) => console.log(format(f)))
  }
  if (decision.unused.length > 0) {
    console.warn('\n例外リストにあるが、もう報告されていない項目（scripts/ci/auditAllowlist.ts から削除してよい）:')
    decision.unused.forEach((e) => console.warn(`  - ${e.package} ${e.id}`))
  }
  if (decision.expired.length > 0) {
    console.error('\n例外の期限が切れた脆弱性（上流の修正を確認し、延長か削除を判断する）:')
    decision.expired.forEach((f) => console.error(format(f)))
  }
  if (decision.blocking.length > 0) {
    console.error('\n例外リストにない high 以上の脆弱性:')
    decision.blocking.forEach((f) => console.error(format(f)))
  }

  if (decision.blocking.length > 0 || decision.expired.length > 0) {
    console.error('\nnpm audit: 失敗')
    process.exit(1)
  }
  console.log('\nnpm audit: 成功（例外リストにない high 以上の脆弱性はありません）')
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
