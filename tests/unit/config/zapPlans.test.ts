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

const PLANS = ['full-prod.yaml'] as const

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
