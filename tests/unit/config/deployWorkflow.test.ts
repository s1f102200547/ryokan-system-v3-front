// @vitest-environment node
// デプロイの前に、ログイン画面の reCAPTCHA Enterprise のサイトキー（GitHub の Variables）を確かめること（.github/workflows/deploy.yml）。
// 空のままデプロイすると、SMS の所で 503 になり誰もログインできない。確かめる規則がアプリと違うと、
// 「ワークフローは通ったのにログインが 503」になるので、規則の一致と、確認のスクリプトの動きを見る
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { RECAPTCHA_SITE_KEY_PATTERN } from '@/constants/auth'
import { parseRecaptchaSiteKey } from '@/lib/auth/recaptchaSiteKey'

const ROOT = path.resolve(__dirname, '../../..')
const WORKFLOW = readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8')
const LINES = WORKFLOW.split('\n')
const STEP_NAME = 'Check RECAPTCHA_SITE_KEY'

// 確認のステップの範囲（「- name: …」の行から、同じ字下げの次の「- 」の手前まで）
function stepLines(): string[] {
  const start = LINES.findIndex((l) => l.trim() === `- name: ${STEP_NAME}`)
  expect(start, `${STEP_NAME} のステップがない`).toBeGreaterThanOrEqual(0)
  const indent = LINES[start].indexOf('-')
  const end = LINES.findIndex((l, i) => i > start && l.indexOf('-') === indent && l.trim().startsWith('- '))
  return LINES.slice(start, end < 0 ? undefined : end)
}

// run: | の中身（字下げを外したもの）
function runScript(): string {
  const lines = stepLines()
  const runAt = lines.findIndex((l) => l.trim() === 'run: |')
  expect(runAt).toBeGreaterThanOrEqual(0)
  const body = lines.slice(runAt + 1).filter((l) => l.trim() !== '')
  const indent = Math.min(...body.map((l) => l.length - l.trimStart().length))
  return body.map((l) => l.slice(indent)).join('\n')
}

function check(value: string | undefined) {
  // ワークフローの環境に近づけるため、PATH 以外は渡さない（NODE_ENV は型が求めるので入れる。スクリプトは見ない）
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: process.env.PATH ?? '' }
  if (value !== undefined) env.RECAPTCHA_SITE_KEY = value
  return spawnSync('bash', ['-c', runScript()], { env, encoding: 'utf8' })
}

const VALID = '6Ldi8xwuAAAAAOPV8MlkljionzTDwYq2eke07CUF'

describe('deploy.yml の RECAPTCHA_SITE_KEY の確認', () => {
  it('GCP への認証・ビルドより前（最初のステップ）にある', () => {
    const steps = LINES.filter((l) => /^ {6}- /.test(l))
    expect(steps[0].trim()).toBe(`- name: ${STEP_NAME}`)
  })

  it('値は Variables から env で渡し、run に ${{ }} を直接書かない（スクリプトの注入を防ぐ）', () => {
    const lines = stepLines().map((l) => l.trim())
    expect(lines).toContain('RECAPTCHA_SITE_KEY: ${{ vars.RECAPTCHA_SITE_KEY }}')
    expect(runScript()).not.toContain('${{')
  })

  it('規則がアプリ（RECAPTCHA_SITE_KEY_PATTERN）と同じ', () => {
    expect(runScript()).toContain(`pattern='${RECAPTCHA_SITE_KEY_PATTERN}'`)
  })

  it('Cloud Run に渡すのも同じ Variables', () => {
    expect(WORKFLOW).toContain('RECAPTCHA_SITE_KEY=${{ vars.RECAPTCHA_SITE_KEY }}')
  })

  it('サイトキーの形なら通る', () => {
    expect(check(VALID).status).toBe(0)
  })

  it.each([
    ['未設定', undefined],
    ['空', ''],
    ['短すぎる', 'abc'],
    ['記号を含む', `${VALID}"; echo injected`],
    ['空白を含む', `${VALID} x`],
  ])('%s なら落とし、理由を出す', (_label, value) => {
    const result = check(value)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::')
    expect(result.stdout).not.toContain('injected')
  })

  // 同じ値をアプリとワークフローの両方に渡して、判断が一致すること（ワークフローの方が厳しいのは、前後の空白だけ）
  it.each([VALID, 'a'.repeat(20), 'a'.repeat(100), 'a'.repeat(101), 'a'.repeat(19), 'abc_DEF-123_456-789x', 'key.with.dots-0000000'])(
    '%s: アプリとワークフローの判断が同じ',
    (value) => {
      expect(check(value).status === 0).toBe(parseRecaptchaSiteKey(value) !== null)
    },
  )
})
