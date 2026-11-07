// @vitest-environment node
// 外から取り込むもの（GitHub Actions・Docker イメージ・CI で入れるツール）が、後から書き換えられない形で固定されていること。
// タグ（@v7、:stable）や版の範囲は、作者や乗っ取った人が指す先を差し替えられる。差し替えられると、次の CI・ビルドで
// 悪いコードがこのリポジトリの権限で動く（例: 2025-03 の tj-actions/changed-files）。SHA・digest は中身から決まるので差し替えられない
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows')
const WORKFLOWS = readdirSync(WORKFLOW_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => ({ name: f, text: readFileSync(path.join(WORKFLOW_DIR, f), 'utf8') }))

type Finding = { line: number; text: string }

// 行ごとに見て、条件に合わない行を返す（YAML のパーサーは入れない。対象のキーはどれも1行で書く）
function scan(text: string, select: RegExp, ok: (value: string) => boolean): Finding[] {
  return text.split('\n').flatMap((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '') // 行末のコメント（# v7.0.1 など）は判定に使わない
    const m = line.match(select)
    return m && !ok(m[1].trim()) ? [{ line: i + 1, text: raw.trim() }] : []
  })
}

const SHA40 = /^[^@\s]+@[0-9a-f]{40}$/
const DIGEST = /@sha256:[0-9a-f]{64}$/

// uses: は 40 桁のコミット SHA。同じリポジトリの action（./）は対象外
function unpinnedUses(text: string): Finding[] {
  return scan(text, /^\s*(?:-\s+)?uses:\s*(\S+)/, (v) => v.startsWith('./') || SHA40.test(v) || (v.startsWith('docker://') && DIGEST.test(v)))
}

// Docker イメージ（ZAP の docker_name、*_IMAGE の環境変数、Dockerfile の FROM）は digest つき
function unpinnedImages(text: string): Finding[] {
  return [
    ...scan(text, /^\s*docker_name:\s*(\S+)/, (v) => DIGEST.test(v)),
    ...scan(text, /^\s*[A-Z0-9_]*_IMAGE:\s*(\S+)/, (v) => DIGEST.test(v)),
    ...scan(text, /^\s*FROM\s+(\S+)/i, (v) => DIGEST.test(v)),
  ]
}

// CI で入れるツールは正確な版（@latest・範囲・版なしは不可）
function unpinnedTools(text: string): Finding[] {
  return scan(text, /\bnpm\s+(?:install|i)\s+-g\s+(\S+)/, (v) => /^(?:@[^/\s]+\/)?[^@\s]+@\d+\.\d+\.\d+$/.test(v))
}

// curl で取ってくるバイナリは、同じワークフローでチェックサムを検査する
function unverifiedDownloads(text: string): Finding[] {
  if (!/\bcurl\b[^\n]*releases\/download/.test(text)) return []
  return /sha256sum\s+-c/.test(text) ? [] : [{ line: 0, text: 'curl で取得しているが sha256sum -c がない' }]
}

describe('判定の関数（悪い例を検出できる）', () => {
  it.each([
    'uses: actions/checkout@v7',
    '- uses: actions/checkout@v7.0.1',
    '  - uses: actions/checkout@main',
    'uses: actions/checkout@3d3c42e', // 短い SHA
    'uses: actions/checkout',
    'uses: docker://alpine:3.24',
  ])('%s は固定されていない', (line) => {
    expect(unpinnedUses(line)).toHaveLength(1)
  })

  it.each([
    'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    'uses: ./.github/actions/setup',
  ])('%s は固定されている', (line) => {
    expect(unpinnedUses(line)).toEqual([])
  })

  it.each([
    'docker_name: ghcr.io/zaproxy/zaproxy:stable',
    'docker_name: ghcr.io/zaproxy/zaproxy:2.17.0',
    'SEMGREP_IMAGE: semgrep/semgrep:latest',
    'FROM node:26-alpine AS deps',
    'FROM node:26-alpine@sha256:abc AS deps', // digest が短い
  ])('%s は digest で固定されていない', (line) => {
    expect(unpinnedImages(line)).toHaveLength(1)
  })

  it.each([
    'run: npm install -g firebase-tools',
    'run: npm install -g firebase-tools@latest',
    'run: npm install -g firebase-tools@^15.34.1',
    'run: npm i -g firebase-tools@15',
  ])('%s は版が固定されていない', (line) => {
    expect(unpinnedTools(line)).toHaveLength(1)
  })

  it('curl で取得してチェックサムを見ないものを検出する', () => {
    expect(unverifiedDownloads('curl -fsSLO "https://github.com/x/y/releases/download/v1/y.tar.gz"')).toHaveLength(1)
  })
})

describe.each(WORKFLOWS)('.github/workflows/$name', ({ text }) => {
  it('uses: がすべて 40 桁の SHA', () => {
    expect(unpinnedUses(text)).toEqual([])
  })
  it('Docker イメージがすべて digest つき', () => {
    expect(unpinnedImages(text)).toEqual([])
  })
  it('npm install -g のツールがすべて正確な版', () => {
    expect(unpinnedTools(text)).toEqual([])
  })
  it('curl で取得するバイナリはチェックサムを検査する', () => {
    expect(unverifiedDownloads(text)).toEqual([])
  })
})

it('ワークフローを読めている（空振りしていない）', () => {
  expect(WORKFLOWS.map((w) => w.name)).toEqual(expect.arrayContaining(['ci.yml', 'deploy.yml']))
  expect(WORKFLOWS.flatMap((w) => w.text.match(/uses:/g) ?? []).length).toBeGreaterThan(10)
})

it('Dockerfile の FROM がすべて digest つき', () => {
  const text = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8')
  expect(text.match(/^FROM\s/gim)?.length).toBeGreaterThan(0)
  expect(unpinnedImages(text)).toEqual([])
})
