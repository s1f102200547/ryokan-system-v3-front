// ログイン成功の通知（Slack・ログ）に載せる内容を作る。旅館の外からのログイン（盗まれたパスワードの利用）に気付くため。
// ヘッダーはどれも利用者が書けるので、そのまま Slack に載せない（書式・リンク・メンションを入れさせない）

import type { ClientRejection } from '@/lib/auth/clientCheck'
import { describeUserAgent } from '@/lib/auth/userAgent'

// X-Forwarded-For は、Google のフロントエンドが既存の値の後ろに接続元を足していく。
// 先頭側は利用者が自由に書けて、右端側が Google の書いた値。どの位置が接続元かは本番のログで確かめる
const MAX_FORWARDED_ENTRIES = 4
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const IPV6 = /^(?=.*:)[0-9a-f:.]{2,45}$/i

// 右端から最大4件。IP の形をしていない値は「?」にする
export function forwardedIps(header: string | null): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((v) => v.trim())
    .slice(-MAX_FORWARDED_ENTRIES)
    .map((v) => (IPV4.test(v) || IPV6.test(v) ? v : '?'))
}

// Slack の書式で意味を持つ文字を無効にする（https://api.slack.com/reference/surfaces/formatting#escaping）
function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// MM/DD HH:mm（JST）
function formatJST(nowMs: number): string {
  const d = new Date(nowMs + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export type LoginNoticeInput = {
  account: string // ログインした PC のアカウント（email、なければ uid）
  forwardedFor: string | null // X-Forwarded-For ヘッダー
  userAgent: string | null
  nowMs: number
}

export function buildLoginNotice({ account, forwardedFor, userAgent, nowMs }: LoginNoticeInput): string {
  const ips = forwardedIps(forwardedFor)
  const ipLabel = ips.length > 0 ? ips.join(', ') : '不明'
  return `[ログイン] ${escapeSlack(account)} / IP ${ipLabel}（右端が Google の追記） / ${describeUserAgent(userAgent)} / ${formatJST(nowMs)}`
}

const REJECTION_LABELS: Record<ClientRejection, string> = {
  os_not_allowed: 'Windows 以外の端末',
  browser_not_allowed: 'Chrome・Edge 以外のブラウザ',
}

// 端末・ブラウザの確認で断ったときの通知。パスワードは合っているので、別の端末での利用か、盗まれたパスワードの利用
export function buildLoginRejectedNotice(input: LoginNoticeInput & { reason: ClientRejection }): string {
  const { account, forwardedFor, userAgent, nowMs, reason } = input
  const ips = forwardedIps(forwardedFor)
  const ipLabel = ips.length > 0 ? ips.join(', ') : '不明'
  return `[ログイン拒否] ${escapeSlack(account)} / ${REJECTION_LABELS[reason]} / IP ${ipLabel}（右端が Google の追記） / ${describeUserAgent(userAgent)} / ${formatJST(nowMs)}`
}
