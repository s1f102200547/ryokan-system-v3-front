// ログイン成功の通知（Slack・ログ）に載せる内容を作る。旅館の外からのログイン（盗まれたパスワードの利用）に気付くため。
// ヘッダーはどれも利用者が書けるので、そのまま Slack に載せない（書式・リンク・メンションを入れさせない）

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

// User-Agent からブラウザと OS の種類だけを取り出す。Edge は Chrome と同じ形で、末尾に Edg/ が付く
export function describeUserAgent(userAgent: string | null): string {
  const ua = userAgent ?? ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : 'その他のブラウザ'
  const os = /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : '不明な OS'
  return `${browser} on ${os}`
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
