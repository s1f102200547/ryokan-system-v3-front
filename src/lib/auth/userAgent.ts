// User-Agent からブラウザと OS の種類だけを取り出す（ログインの可否と、Slack・ログの表示に使う）

export type UserAgentBrowser = 'chrome' | 'edge' | 'other'
export type UserAgentOs = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'
export type ParsedUserAgent = { browser: UserAgentBrowser; os: UserAgentOs }

// Chrome をもとにしたブラウザの多くは、Chrome と同じ形の末尾に自分の名前を足す。
// Edge は Edg/。旧 Edge（EdgeHTML）は Edge/。Opera などは Chrome として扱わない。
// \b を付けて、自動操作の HeadlessChrome/ を Chrome にしない
const EDGE = /\bEdg\//
const OTHER_CHROMIUM = /\b(?:Edge|OPR|Vivaldi|YaBrowser|SamsungBrowser)\//
const CHROME = /\bChrome\//

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  const ua = userAgent ?? ''
  const browser: UserAgentBrowser = EDGE.test(ua) ? 'edge'
    : OTHER_CHROMIUM.test(ua) ? 'other'
    : CHROME.test(ua) ? 'chrome'
    : 'other'
  // Android は Linux を、iPad の一部は Macintosh を名乗るので先に見る
  const os: UserAgentOs = /Android/.test(ua) ? 'android'
    : /iPhone|iPad/.test(ua) ? 'ios'
    : /Windows/.test(ua) ? 'windows'
    : /Macintosh/.test(ua) ? 'macos'
    : /Linux/.test(ua) ? 'linux'
    : 'unknown'
  return { browser, os }
}

const BROWSER_LABELS: Record<UserAgentBrowser, string> = { chrome: 'Chrome', edge: 'Edge', other: 'その他のブラウザ' }
const OS_LABELS: Record<UserAgentOs, string> = {
  windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS', unknown: '不明な OS',
}

// 「Edge on Windows」の形。生の User-Agent は利用者が書けるので、Slack・ログにはこちらを載せる
export function describeUserAgent(userAgent: string | null): string {
  const { browser, os } = parseUserAgent(userAgent)
  return `${BROWSER_LABELS[browser]} on ${OS_LABELS[os]}`
}
