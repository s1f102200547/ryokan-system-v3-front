import { describe, it, expect } from 'vitest'
import { buildLoginNotice, buildLoginRejectedNotice, forwardedIps } from '@/lib/auth/loginNotice'
import { describeUserAgent } from '@/lib/auth/userAgent'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const EDGE_WIN = `${CHROME_WIN} Edg/141.0.0.0`
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

describe('forwardedIps', () => {
  it('ヘッダーがなければ空', () => {
    expect(forwardedIps(null)).toEqual([])
    expect(forwardedIps('')).toEqual([])
  })

  it('IPv4・IPv6 はそのまま、右端から最大4件', () => {
    expect(forwardedIps('1.1.1.1, 2.2.2.2, 3.3.3.3, 2001:db8::1, 203.0.113.5'))
      .toEqual(['2.2.2.2', '3.3.3.3', '2001:db8::1', '203.0.113.5'])
  })

  // 先頭側は利用者が自由に書ける。Slack の書式・メンション・リンクを載せない
  it.each(['<!channel>', '<https://evil.example|click>', 'cafe', 'localhost', '*bold*'])('IP でない値（%s）は ?', (spoofed) => {
    expect(forwardedIps(`${spoofed}, 203.0.113.5`)).toEqual(['?', '203.0.113.5'])
  })
})

describe('describeUserAgent', () => {
  it.each([
    [CHROME_WIN, 'Chrome on Windows'],
    [EDGE_WIN, 'Edge on Windows'],
    [CHROME_ANDROID, 'Chrome on Android'],
    [SAFARI_IPHONE, 'その他のブラウザ on iOS'],
    [CHROME_MAC, 'Chrome on macOS'],
    [null, 'その他のブラウザ on 不明な OS'],
    ['<!channel>', 'その他のブラウザ on 不明な OS'],
  ])('%s → %s', (ua, expected) => {
    expect(describeUserAgent(ua)).toBe(expected)
  })
})

describe('buildLoginNotice', () => {
  it('アカウント・IP・ブラウザ・JST の時刻を1行にする', () => {
    // 2026-11-03T22:12Z = JST 11/04 07:12（UTC では前日）
    const message = buildLoginNotice({
      account: 'pc1@example.com',
      forwardedFor: '203.0.113.5',
      userAgent: EDGE_WIN,
      nowMs: Date.parse('2026-11-03T22:12:00Z'),
    })
    expect(message).toBe('[ログイン] pc1@example.com / IP 203.0.113.5（右端が Google の追記） / Edge on Windows / 11/04 07:12')
  })

  it('IP が取れなければ「不明」、アカウントの < > & は無効にする', () => {
    const message = buildLoginNotice({ account: '<a&b>', forwardedFor: null, userAgent: null, nowMs: 0 })
    expect(message).toContain('&lt;a&amp;b&gt;')
    expect(message).toContain('IP 不明')
  })
})

describe('buildLoginRejectedNotice', () => {
  it('アカウント・理由・IP・ブラウザ・JST の時刻を1行にする', () => {
    const message = buildLoginRejectedNotice({
      account: 'pc1@example.com',
      forwardedFor: '203.0.113.5',
      userAgent: CHROME_MAC,
      nowMs: Date.parse('2026-11-03T22:12:00Z'),
      reason: 'os_not_allowed',
    })
    expect(message).toBe('[ログイン拒否] pc1@example.com / Windows 以外の端末 / IP 203.0.113.5（右端が Google の追記） / Chrome on macOS / 11/04 07:12')
  })

  it('ブラウザの理由、アカウントの < > & は無効にする', () => {
    const message = buildLoginRejectedNotice({ account: '<a&b>', forwardedFor: null, userAgent: null, nowMs: 0, reason: 'browser_not_allowed' })
    expect(message).toContain('Chrome・Edge 以外のブラウザ')
    expect(message).toContain('&lt;a&amp;b&gt;')
  })
})

