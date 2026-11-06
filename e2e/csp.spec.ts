import { test, expect, type Page } from '@playwright/test'

// CSP の nonce が実際にブラウザで効いていることを確かめる。
// 正しい nonce の script だけが動き、不正な nonce・nonce なしの script は止められる。
// HTML に直接書かれた script（parser-inserted）には 'strict-dynamic' の引き継ぎが効かないので、nonce だけで判定される

type Violation = { directive: string; sample: string }

declare global {
  interface Window {
    __cspViolations?: Violation[]
    __validRan?: boolean
    __invalidRan?: boolean
    __noNonceRan?: boolean
  }
}

function nonceFromCsp(csp: string | undefined): string {
  const m = csp?.match(/script-src[^;]*'nonce-([^']+)'/)
  if (!m) throw new Error('CSP ヘッダーの script-src に nonce がない')
  return m[1]
}

// ページの script より先に、CSP 違反を記録する（addInitScript は CSP の対象外）
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations?.push({ directive: e.effectiveDirective, sample: e.sample })
    })
  })
}

test.describe('CSP の nonce', () => {
  test('正しい nonce の script だけが動き、不正な nonce・nonce なしは止められる', async ({ page }) => {
    await recordViolations(page)
    let nonce = ''
    await page.route('/login', async (route) => {
      const response = await route.fetch()
      nonce = nonceFromCsp(response.headers()['content-security-policy'])
      const injected = [
        `<script nonce="${nonce}">window.__validRan = true</script>`,
        `<script nonce="invalid-${nonce}">window.__invalidRan = true</script>`,
        `<script>window.__noNonceRan = true</script>`,
      ].join('')
      const body = (await response.text()).replace('</head>', `${injected}</head>`)
      await route.fulfill({ response, body })
    })

    await page.goto('/login')
    await expect(page.getByLabel('メールアドレス')).toBeVisible()

    const result = await page.evaluate(() => ({
      valid: window.__validRan ?? false,
      invalid: window.__invalidRan ?? false,
      noNonce: window.__noNonceRan ?? false,
      violations: window.__cspViolations ?? [],
    }))
    expect(nonce).not.toBe('')
    expect(result.valid).toBe(true)
    expect(result.invalid).toBe(false)
    expect(result.noNonce).toBe(false)
    // 止めた2つが script-src の違反として報告される
    expect(result.violations.filter((v) => v.directive.startsWith('script-src'))).toHaveLength(2)
  })

  test('サーバーが返す HTML の script と MUI の style にはリクエストごとの nonce が付き、CSP 違反は起きない', async ({ page }) => {
    await recordViolations(page)
    const response = await page.goto('/login')
    if (!response) throw new Error('レスポンスがない')
    const nonce = nonceFromCsp(response.headers()['content-security-policy'])
    const html = await response.text()

    // HTML に書かれた script・style（parser-inserted）は nonce がないと止められる。
    // 読み込み後に Next.js が足す script は 'strict-dynamic' で許可されるので、ここでは見ない
    const scripts = html.match(/<script\b[^>]*>/g) ?? []
    const styles = html.match(/<style\b[^>]*data-emotion[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([])
    expect(styles.length).toBeGreaterThan(0)
    expect(styles.filter((tag) => !tag.includes(`nonce="${nonce}"`))).toEqual([])

    // script が止められていればフォームは操作できない（hydration されない）
    await page.getByLabel('メールアドレス').fill('a@example.com')
    await expect(page.getByLabel('メールアドレス')).toHaveValue('a@example.com')
    expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([])
  })
})
