// npm audit の結果を例外リストと突き合わせる判定ロジック（I/O を持たない純粋関数）
import type { AuditAllowlistEntry } from './auditAllowlist'

// npm audit --json（npm 7 以降）の必要な部分だけ
export type AuditAdvisory = {
  name: string
  title: string
  url: string
  severity: string
  range: string
}

export type AuditReport = {
  vulnerabilities?: Record<string, { via: (string | AuditAdvisory)[] }>
}

export type AuditFinding = {
  id: string
  package: string
  severity: string
  title: string
  url: string
}

export type AuditDecision = {
  blocking: AuditFinding[] // CI を失敗させるもの
  allowed: AuditFinding[] // 例外リストで許可したもの
  expired: AuditFinding[] // 例外リストにあるが期限切れ（CI を失敗させる）
  unused: AuditAllowlistEntry[] // 例外リストにあるが、もう報告されていない（削除してよい）
}

const BLOCKING_SEVERITIES = new Set(['high', 'critical'])

// advisory の URL（https://github.com/advisories/GHSA-xxxx）の末尾を ID とする
function advisoryId(url: string): string {
  return url.split('/').pop() ?? url
}

// via のうち文字列は「別パッケージ経由」を表すだけなので、advisory 本体（オブジェクト）だけを集める
export function collectFindings(report: AuditReport): AuditFinding[] {
  const findings = new Map<string, AuditFinding>()
  for (const { via } of Object.values(report.vulnerabilities ?? {})) {
    for (const v of via) {
      if (typeof v === 'string' || !BLOCKING_SEVERITIES.has(v.severity)) continue
      const finding = { id: advisoryId(v.url), package: v.name, severity: v.severity, title: v.title, url: v.url }
      findings.set(`${finding.id}|${finding.package}`, finding)
    }
  }
  return [...findings.values()]
}

// today: YYYY-MM-DD（JST）。expires の当日までは有効
export function decide(
  findings: AuditFinding[],
  allowlist: readonly AuditAllowlistEntry[],
  today: string,
): AuditDecision {
  const matchEntry = (f: AuditFinding) =>
    allowlist.find((e) => e.id === f.id && e.package === f.package)

  const decision: AuditDecision = { blocking: [], allowed: [], expired: [], unused: [] }
  for (const f of findings) {
    const entry = matchEntry(f)
    if (entry === undefined) decision.blocking.push(f)
    else if (entry.expires < today) decision.expired.push(f)
    else decision.allowed.push(f)
  }
  decision.unused = allowlist.filter(
    (e) => !findings.some((f) => f.id === e.id && f.package === e.package),
  )
  return decision
}
