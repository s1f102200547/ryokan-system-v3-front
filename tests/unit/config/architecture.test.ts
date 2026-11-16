// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// アーキテクチャの決まり（AGENTS.md「アーキテクチャ」「壊してはいけないもの」）を、src/ の import と呼び出しを読んで確かめる
// （docs/MfaBugHunt.md の S11）。ESLint が見ているのは「src/ から firebase を import しない」だけ

const ROOT = path.resolve(__dirname, '../../..')
const SRC = path.join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}
const FILES = walk(SRC)
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/')
const source = (file: string) => readFileSync(file, 'utf8')

type Import = { spec: string; typeOnly: boolean }
// import・export … from・import() を、型だけの import かどうかと一緒に取り出す
function importsOf(file: string): Import[] {
  const sf = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true)
  const out: Import[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      const typeOnly = !!clause && (clause.isTypeOnly
        || (!clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0
          && clause.namedBindings.elements.every((e) => e.isTypeOnly)))
      out.push({ spec: node.moduleSpecifier.text, typeOnly })
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly })
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
      out.push({ spec: node.arguments[0].text, typeOnly: false })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

// '@/x/y' → src からの相対パス（'x/y'）。相対 import も同じ形にする。外部のパッケージは null
function resolve(from: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (spec.startsWith('.')) return rel(path.resolve(path.dirname(from), spec))
  return null
}
// 層: app/api・app・application・domain/ports・domain・infra・hooks・components・lib/<名前>・constants・types
function layerOf(p: string): string {
  if (p.startsWith('app/api/')) return 'app/api'
  const [top, second] = p.split('/')
  if (top === 'domain' && second === 'ports') return 'domain/ports'
  return top.replace(/\.tsx?$/, '')
}

describe('層の依存（AGENTS.md の表）', () => {
  // 依存してよい層。lib は横断処理なので、lib どうし・types・constants だけ
  const ALLOWED: Record<string, string[]> = {
    'app/api': ['application', 'infra', 'lib', 'domain', 'domain/ports', 'types', 'constants'],
    application: ['application', 'domain', 'domain/ports', 'infra', 'lib', 'types', 'constants'],
    domain: ['domain', 'domain/ports', 'types', 'constants'],
    'domain/ports': ['domain', 'types'],
    infra: ['domain/ports', 'lib', 'types', 'constants', 'infra'],
    hooks: ['lib', 'types', 'constants', 'hooks'],
    components: ['hooks', 'domain', 'lib', 'types', 'constants', 'components'],
    lib: ['lib', 'types', 'constants'],
    constants: ['constants'],
    types: ['types', 'constants'],
  }
  // 決まりの例外（AGENTS.md に書かれているもの）
  const EXCEPTIONS: [from: RegExp, to: RegExp, why: string][] = [
    [/^domain\//, /^lib\/dateUtils$/, 'domain は lib/dateUtils だけ使ってよい'],
    [/^hooks\//, /^application\//, 'hooks は application の型だけ（下で typeOnly を確かめる）'],
    // 記録 F-17: AGENTS.md の表は「infra は domain/ports だけ」。回数・通数の判定（純粋な domain の関数）を、
    // Firestore のトランザクションの中で呼ぶ（読みと書きの間に割り込ませない）。表を直すか、ここを直すかは S19
    [/^infra\/auth\/firestoreLoginThrottleRepository\.ts$/, /^domain\/auth\/loginThrottle$/, 'F-17'],
    [/^infra\/auth\/firestoreSmsQuotaRepository\.ts$/, /^domain\/auth\/smsQuota$/, 'F-17'],
  ]
  // 型だけの import は実行時に残らない。domain・domain/ports・application・types の型は、どの層から使ってもよい（記録 F-17: 表には書かれていない）
  const TYPE_ONLY_TARGETS = ['domain', 'domain/ports', 'application', 'types']

  const edges = FILES.flatMap((file) => importsOf(file).flatMap(({ spec, typeOnly }) => {
    const to = resolve(file, spec)
    return to === null ? [] : [{ from: rel(file), to, typeOnly }]
  }))

  it('import を読めている（読み取りの壊れの検出）', () => {
    expect(edges.length).toBeGreaterThan(200)
    expect(edges.some((e) => e.from === 'app/api/auth/login/route.ts' && e.to === 'application/auth/loginWithPasswordCommand')).toBe(true)
  })

  it('どの層も、依存してよい層だけを import する', () => {
    const violations = edges.filter(({ from, to, typeOnly }) => {
      const a = layerOf(from)
      const b = layerOf(to)
      if (a === 'app' || ALLOWED[a] === undefined) return false // app/（ページ）はすべてに依存してよい
      if (ALLOWED[a].includes(b)) return false
      if (typeOnly && TYPE_ONLY_TARGETS.includes(b)) return false
      if (EXCEPTIONS.some(([f, t]) => f.test(from) && t.test(to))) {
        return /^hooks\//.test(from) && /^application\//.test(to) ? !typeOnly : false
      }
      return true
    }).map(({ from, to, typeOnly }) => `${from} → ${to}${typeOnly ? '（型だけ）' : ''}`)
    expect(violations).toEqual([])
  })
})

describe('ブラウザで動くコード', () => {
  // 'use client' のファイルから import をたどり、サーバーだけのもの（firebase-admin、Node の crypto・fs、infra、application）に届かない。
  // 届くと、ブラウザの bundle にサーバーのコードが入るか、ビルドが失敗する
  const SERVER_ONLY = [/^lib\/firebase\//, /^infra\//, /^application\//, /^lib\/logger$/, /^lib\/slack$/]
  const SERVER_PACKAGES = [/^firebase-admin/, /^node:/, /^(fs|crypto|path)$/, /^next\/server$/]
  const fileOf = (p: string) => ['.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => path.join(SRC, p + ext)).find((f) => existsSync(f))

  it('"use client" のファイルから、サーバーだけのモジュール・パッケージに届かない（型だけの import は除く）', () => {
    const clients = FILES.filter((f) => /^\s*['"]use client['"]/.test(source(f)))
    expect(clients.length).toBeGreaterThan(10)
    const violations: string[] = []
    for (const entry of clients) {
      const seen = new Set<string>()
      const stack: [file: string, chain: string[]][] = [[entry, [rel(entry)]]]
      while (stack.length > 0) {
        const [file, chain] = stack.pop()!
        for (const { spec, typeOnly } of importsOf(file)) {
          if (typeOnly) continue
          const to = resolve(file, spec)
          if (to === null) {
            if (SERVER_PACKAGES.some((r) => r.test(spec))) violations.push([...chain, spec].join(' → '))
            continue
          }
          if (SERVER_ONLY.some((r) => r.test(to))) { violations.push([...chain, to].join(' → ')); continue }
          const next = fileOf(to.replace(/\.tsx?$/, ''))
          if (next && !seen.has(next)) { seen.add(next); stack.push([next, [...chain, to]]) }
        }
      }
    }
    expect([...new Set(violations)]).toEqual([])
  })
})

describe('Route Handler（AGENTS.md「壊してはいけないもの」5）', () => {
  const routes = FILES.filter((f) => /^app\/api\/.*\/route\.ts$/.test(rel(f)))
  // ログイン前の API。requireSession の代わりに、自分で時間帯を確かめる
  const LOGIN_ROUTES = ['app/api/auth/login/route.ts', 'app/api/auth/login/verify/route.ts']
  const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

  // export された HTTP メソッドの関数と、その本文で呼んでいる関数の名前
  function handlers(file: string): { method: string; calls: Set<string> }[] {
    const sf = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true)
    const out: { method: string; calls: Set<string> }[] = []
    for (const stmt of sf.statements) {
      const exported = ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      if (!exported || !ts.isFunctionDeclaration(stmt) || !stmt.name || !HTTP_METHODS.has(stmt.name.text)) continue
      const calls = new Set<string>()
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) calls.add(n.expression.text)
        ts.forEachChild(n, visit)
      }
      if (stmt.body) visit(stmt.body)
      out.push({ method: stmt.name.text, calls })
    }
    return out
  }

  it('Route Handler を見つけている。どの route.ts も、HTTP メソッドを export function の形で書く（export const だと下の検査をすり抜ける）', () => {
    expect(routes.length).toBeGreaterThanOrEqual(13)
    expect(routes.map(rel)).toEqual(expect.arrayContaining(LOGIN_ROUTES))
    expect(routes.filter((f) => handlers(f).length === 0).map(rel)).toEqual([])
    for (const f of routes) expect(source(f), rel(f)).not.toMatch(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/)
  })

  it('ログインの API 以外は、export した全メソッドが requireSession を呼ぶ', () => {
    const missing = routes.filter((f) => !LOGIN_ROUTES.includes(rel(f)))
      .flatMap((f) => handlers(f).filter((h) => !h.calls.has('requireSession')).map((h) => `${rel(f)} ${h.method}`))
    expect(missing).toEqual([])
  })

  it('ログインの API は requireSession を呼ばず、本番の時間帯を自分で確かめる', () => {
    for (const f of routes.filter((r) => LOGIN_ROUTES.includes(rel(r)))) {
      for (const h of handlers(f)) {
        expect(h.calls.has('requireSession'), `${rel(f)} ${h.method}`).toBe(false)
        expect(h.calls.has('isOutsideBusinessHours'), `${rel(f)} ${h.method}`).toBe(true)
      }
    }
  })

  it('どの Route も、export した全メソッドが handleRouteError を通す（障害を 5xx と Slack にする）', () => {
    const missing = routes.flatMap((f) => handlers(f).filter((h) => !h.calls.has('handleRouteError')).map((h) => `${rel(f)} ${h.method}`))
    expect(missing).toEqual([])
  })
})

describe('hooks の通信（AGENTS.md「実装ルール」）', () => {
  // ログインの画面（ログイン前）だけが fetch を直接使ってよい
  const LOGIN_HOOKS = ['hooks/auth/useLogin.ts', 'hooks/auth/fetchWithSession.ts', 'hooks/auth/recaptchaEnterprise.ts']
  it('ログイン必須の API を呼ぶ hooks・components は fetch を直接使わず fetchWithSession を使う', () => {
    const offenders = FILES.filter((f) => /^(hooks|components)\//.test(rel(f)) && !LOGIN_HOOKS.includes(rel(f)))
      .filter((f) => /(^|[^.\w])fetch\s*\(/.test(source(f).replace(/\/\/.*$/gm, '')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('ログインの入力の長さ（UI と API の Zod で同じ定数）', () => {
  it.each([
    ['components/auth/LoginForm.tsx', ['LOGIN_EMAIL_MIN_LENGTH', 'LOGIN_EMAIL_MAX_LENGTH', 'LOGIN_PASSWORD_MIN_LENGTH', 'LOGIN_PASSWORD_MAX_LENGTH', 'MFA_CODE_LENGTH']],
    ['components/auth/MfaCodeInput.tsx', ['MFA_CODE_LENGTH']],
    ['lib/auth/mfaCodeInput.ts', ['MFA_CODE_LENGTH']],
    ['lib/api/loginSchema.ts', ['LOGIN_EMAIL_MIN_LENGTH', 'LOGIN_EMAIL_MAX_LENGTH', 'LOGIN_PASSWORD_MIN_LENGTH', 'LOGIN_PASSWORD_MAX_LENGTH', 'MFA_CODE_LENGTH', 'RECAPTCHA_TOKEN_MAX_LENGTH']],
  ])('%s は定数を使う', (file, names) => {
    const text = source(path.join(SRC, file))
    for (const name of names) expect(text, name).toMatch(new RegExp(`\\b${name}\\b`))
  })

  it('ログインの画面と API の Zod に、桁数・長さの数字を直接書かない', () => {
    for (const file of ['components/auth/LoginForm.tsx', 'components/auth/MfaCodeInput.tsx', 'lib/auth/mfaCodeInput.ts', 'lib/api/loginSchema.ts']) {
      const code = source(path.join(SRC, file)).replace(/\/\/.*$/gm, '')
      // min(1)（空でない）だけは数字のままでよい
      expect(code.replace(/\.min\(1\)/g, ''), file).not.toMatch(/\b(minLength|maxLength|min|max|length)\s*[:(=]\s*\d+/)
      expect(code, file).not.toMatch(/\{\s*6\s*\}/)
    }
  })
})
