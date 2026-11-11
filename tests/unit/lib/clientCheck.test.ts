import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { checkClient } from '@/lib/auth/clientCheck'
import { parseUserAgent } from '@/lib/auth/userAgent'

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const EDGE_WIN = `${CHROME_WIN} Edg/141.0.0.0`
const FIREFOX_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const EDGE_MAC = `${CHROME_MAC} Edg/141.0.0.0`
const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
const EDGE_ANDROID = `${CHROME_ANDROID} EdgA/141.0.0.0`
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1'
// 旧 Edge（EdgeHTML）は Edge/。Chrome/ も含む
const LEGACY_EDGE_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.19041'

describe('parseUserAgent', () => {
  it.each([
    [CHROME_WIN, 'chrome', 'windows'],
    [EDGE_WIN, 'edge', 'windows'],
    [FIREFOX_WIN, 'other', 'windows'],
    [`${CHROME_WIN} OPR/120.0.0.0`, 'other', 'windows'],
    [`${CHROME_WIN} Vivaldi/7.0`, 'other', 'windows'],
    [LEGACY_EDGE_WIN, 'other', 'windows'],
    [CHROME_WIN.replace('Chrome/', 'HeadlessChrome/'), 'other', 'windows'],
    [CHROME_MAC, 'chrome', 'macos'],
    [EDGE_MAC, 'edge', 'macos'],
    [CHROME_LINUX, 'chrome', 'linux'],
    [CHROME_ANDROID, 'chrome', 'android'],
    [EDGE_ANDROID, 'chrome', 'android'],
    [SAFARI_IPHONE, 'other', 'ios'],
    [CHROME_IPHONE, 'other', 'ios'],
    ['', 'other', 'unknown'],
    [null, 'other', 'unknown'],
    ['<!channel>', 'other', 'unknown'],
  ])('%s → %s / %s', (ua, browser, os) => {
    expect(parseUserAgent(ua)).toEqual({ browser, os })
  })
})

describe('checkClient', () => {
  it.each([CHROME_WIN, EDGE_WIN])('Windows の Chrome・Edge は通す: %s', (ua) => {
    expect(checkClient(ua)).toEqual({ success: true, value: undefined })
  })

  it.each([CHROME_MAC, EDGE_MAC, CHROME_LINUX, CHROME_ANDROID, SAFARI_IPHONE, '', null])('Windows 以外は os_not_allowed: %s', (ua) => {
    expect(checkClient(ua)).toEqual({ success: false, error: 'os_not_allowed' })
  })

  it.each([FIREFOX_WIN, LEGACY_EDGE_WIN, `${CHROME_WIN} OPR/120.0.0.0`, CHROME_WIN.replace('Chrome/', 'HeadlessChrome/')])(
    'Windows の Chrome・Edge 以外は browser_not_allowed: %s',
    (ua) => {
      expect(checkClient(ua)).toEqual({ success: false, error: 'browser_not_allowed' })
    },
  )

  it('どんな文字列でも例外を投げず、通すのは Windows の Chrome・Edge と判定したものだけ', () => {
    // User-Agent の部品とランダムな文字列を混ぜて組み立てる（ランダムな文字列だけでは Windows・Chrome にほぼ当たらない）
    const part = fc.oneof(
      fc.constantFrom('Windows NT 10.0', 'Macintosh', 'Linux', 'Android', 'iPhone', 'Chrome/141', 'HeadlessChrome/141', 'Edg/141', 'Edge/18', 'OPR/120', 'Firefox/140', ' ', ';'),
      fc.string({ unit: 'binary-ascii', maxLength: 20 }), // 'binary' は生成だけで1秒を超える
    )
    const userAgent = fc.option(fc.array(part, { maxLength: 8 }).map((parts) => parts.join('')))
    fc.assert(fc.property(userAgent, (ua) => {
      const result = checkClient(ua)
      const { browser, os } = parseUserAgent(ua)
      expect(result.success).toBe(os === 'windows' && (browser === 'chrome' || browser === 'edge'))
    }))
  })
})
