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
  replacedSession?: boolean // 同じアカウントの、まだ生きていた前のセッションを切った
}

export function buildLoginNotice({ account, forwardedFor, userAgent, nowMs, replacedSession = false }: LoginNoticeInput): string {
  const ips = forwardedIps(forwardedFor)
  const ipLabel = ips.length > 0 ? ips.join(', ') : '不明'
  // 前のセッションを切った: 別の PC・ブラウザで同じアカウントに入った。攻撃者に追い出されたスタッフが入り直すと、これが2回続く
  const replaced = replacedSession ? ' / 前のセッションを切った' : ''
  return `[ログイン] ${escapeSlack(account)} / IP ${ipLabel}（右端が Google の追記） / ${describeUserAgent(userAgent)} / ${formatJST(nowMs)}${replaced}`
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

// ログインの失敗が続いて止め始めたときの通知。メールアドレスは利用者が書いた値なので書式を無効にする。IP は IP の形でなければ「?」
export function buildLoginLockNotice({ key, failures, lockMs }: { key: { kind: 'email' | 'ip'; value: string }; failures: number; lockMs: number }): string {
  const target = key.kind === 'email' ? `アカウント ${escapeSlack(key.value)}` : `IP ${forwardedIps(key.value)[0] ?? '?'}`
  return `[ログイン制限] ${target} / ${failures}回続けて失敗 / ${Math.round(lockMs / 60000)}分止める`
}


// 1アカウントの1日の SMS の数が上限に達して、はじめて断ったときの通知（1日1回）。
// 不正な大量送信（SMS pumping）か、パスワードを知る誰かが SMS を送らせ続けている
export function buildSmsLimitNotice({ account, limit, forwardedFor, nowMs }: { account: string; limit: number; forwardedFor: string | null; nowMs: number }): string {
  const ips = forwardedIps(forwardedFor)
  const ipLabel = ips.length > 0 ? ips.join(', ') : '不明'
  return `[SMS 上限] ${escapeSlack(account)} / 今日 ${limit} 通を超えたので送らない / IP ${ipLabel}（右端が Google の追記） / ${formatJST(nowMs)}`
}
