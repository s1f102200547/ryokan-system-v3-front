// @vitest-environment node
// ZAP の Automation Framework の計画（.zap/full-*.yaml）が、全 Route を検査の対象に入れていること。
// Route を足したのに計画に足し忘れると、その API は ZAP の能動的な検査を受けない
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const API_DIR = path.join(ROOT, 'src/app/api')

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? routeFiles(full) : name === 'route.ts' ? [full] : []
  })
}

// 「GET guest-info」の形（tests/integration/fuzz/routes.fuzz.test.ts の ROUTES と同じ表し方）
const EXPORTED = routeFiles(API_DIR).flatMap((file) => {
  const route = path.relative(API_DIR, path.dirname(file)).split(path.sep).join('/')
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => `${m[1]} ${route}`)
}).sort()

function requestNames(plan: string): string[] {
  return [...plan.matchAll(/name:\s*"([A-Z]+ [^"]+)"/g)].map((m) => m[1]).filter((n) => !n.startsWith('PAGE ')).sort()
}

const PLANS = ['full-prod.yaml', 'full-dev-auth.yaml'] as const

it('Route を読めている（空振りしていない）', () => {
  expect(EXPORTED.length).toBeGreaterThan(10)
})

describe.each(PLANS)('.zap/%s', (file) => {
  const plan = readFileSync(path.join(ROOT, '.zap', file), 'utf8')

  it('全 Route とメソッドを requestor に入れている', () => {
    expect(requestNames(plan)).toEqual(EXPORTED)
  })

  it('.zap/rules.tsv で IGNORE にしたルールを alertFilter でも除外している', () => {
    const ignored = readFileSync(path.join(ROOT, '.zap/rules.tsv'), 'utf8')
      .split('\n').filter((l) => /^\d+\tIGNORE\t/.test(l)).map((l) => l.split('\t')[0])
    const filtered = [...plan.matchAll(/ruleId:\s*(\d+)/g)].map((m) => m[1])
    expect(filtered).toEqual(expect.arrayContaining(ignored))
  })

  it('最後に exitStatus で指摘を失敗にする', () => {
    const jobs = [...plan.matchAll(/^\s+- type:\s*(\S+)/gm)].map((m) => m[1])
    expect(jobs.at(-1)).toBe('exitStatus')
    expect(plan).toMatch(/errorLevel:\s*Low/)
  })
})

// ログイン画面だけ COEP を付けない（reCAPTCHA Enterprise の iframe のため）。除外はその URL だけに絞り、ほかの画面の抜けは指摘させる
describe('COEP（90004）の除外', () => {
  const rules = readFileSync(path.join(ROOT, '.zap/rules.tsv'), 'utf8').split('\n')

  it('rules.tsv は ルール丸ごとの IGNORE にせず、/ と /login だけを OUTOFSCOPE にする', () => {
    expect(rules.filter((l) => l.startsWith('90004\t'))).toEqual(['90004\tOUTOFSCOPE\t^http://localhost:3000/(login)?$'])
    const regex = new RegExp('^http://localhost:3000/(login)?$')
    expect(['http://localhost:3000/', 'http://localhost:3000/login'].every((u) => regex.test(u))).toBe(true)
    expect(['http://localhost:3000/daily-dashboard', 'http://localhost:3000/login/x', 'http://localhost:3000/a_tax_table'].some((u) => regex.test(u))).toBe(false)
  })

  it('段A の計画も同じ URL だけを除外する', () => {
    const plan = readFileSync(path.join(ROOT, '.zap', 'full-prod.yaml'), 'utf8')
    expect(plan).toMatch(/- ruleId: 90004\n\s+url: "http:\/\/127\.0\.0\.1:3000\/\(login\)\?"\n\s+urlRegex: true/)
  })
})

describe('.zap/full-dev-auth.yaml（段B）', () => {
  const plan = readFileSync(path.join(ROOT, '.zap', 'full-dev-auth.yaml'), 'utf8')

  it('Cookie は環境変数から付け、値を計画に書かない', () => {
    expect(plan).toMatch(/replacementString:\s*"session=\$\{ZAP_SESSION\}"/)
    expect(plan).not.toMatch(/session=(?!\$\{ZAP_SESSION\})[A-Za-z0-9_-]{20,}/)
  })

  it('ローカルの開発サーバーだけに向ける', () => {
    const hosts = [...plan.matchAll(/https?:\/\/([^/"\s]+)/g)].map((m) => m[1].replace(/\.\*$/, '')) // includePaths の正規表現（.*）は外す
    expect(new Set(hosts)).toEqual(new Set(['127.0.0.1:3000']))
  })
})
