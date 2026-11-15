// @vitest-environment node
// デプロイの前に、ログイン画面の reCAPTCHA Enterprise のサイトキーと MFA_MODE（GitHub の Variables）を確かめること（.github/workflows/deploy.yml）。
// 空のままデプロイすると、SMS の所で 503 になり誰もログインできない。確かめる規則がアプリと違うと、
// 「ワークフローは通ったのにログインが 503」になるので、規則の一致と、確認のスクリプトの動きを見る
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { MFA_MODES, RECAPTCHA_SITE_KEY_PATTERN } from '@/constants/auth'
import { parseRecaptchaSiteKey } from '@/lib/auth/recaptchaSiteKey'
import { parseMfaMode } from '@/lib/auth/mfaMode'

const ROOT = path.resolve(__dirname, '../../..')
const WORKFLOW = readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8')
const LINES = WORKFLOW.split('\n')
const STEP_NAME = 'Check RECAPTCHA_SITE_KEY'
const MFA_STEP_NAME = 'Check MFA_MODE'

// 確認のステップの範囲（「- name: …」の行から、同じ字下げの次の「- 」の手前まで）
function stepLines(name = STEP_NAME): string[] {
  const start = LINES.findIndex((l) => l.trim() === `- name: ${name}`)
  expect(start, `${name} のステップがない`).toBeGreaterThanOrEqual(0)
  const indent = LINES[start].indexOf('-')
  const end = LINES.findIndex((l, i) => i > start && l.indexOf('-') === indent && l.trim().startsWith('- '))
  return LINES.slice(start, end < 0 ? undefined : end)
}

// run: | の中身（字下げを外したもの）
function runScript(name = STEP_NAME): string {
  const lines = stepLines(name)
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

// SMS の2要素目を誰に求めるか（MFA_MODE）。アプリは未設定・想定外の値を all にするので、SMS を試すつもりの設定忘れを
// デプロイの前に止める。値の一覧がアプリ（MFA_MODES）と違うと「ワークフローは通ったのに全員に SMS」になる
describe('deploy.yml の MFA_MODE の確認', () => {
  function checkMfa(value: string | undefined) {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', PATH: process.env.PATH ?? '' }
    if (value !== undefined) env.MFA_MODE = value
    return spawnSync('bash', ['-c', runScript(MFA_STEP_NAME)], { env, encoding: 'utf8' })
  }

  it('GCP への認証・ビルドより前（2番目のステップ）にある', () => {
    const steps = LINES.filter((l) => /^ {6}- /.test(l))
    expect(steps[1].trim()).toBe(`- name: ${MFA_STEP_NAME}`)
  })

  it('値は Variables から env で渡し、run に ${{ }} を直接書かない', () => {
    expect(stepLines(MFA_STEP_NAME).map((l) => l.trim())).toContain('MFA_MODE: ${{ vars.MFA_MODE }}')
    expect(runScript(MFA_STEP_NAME)).not.toContain('${{')
  })

  it('通す値がアプリ（MFA_MODES）と同じ', () => {
    expect(runScript(MFA_STEP_NAME)).toContain(`  ${MFA_MODES.join('|')}) ;;`)
  })

  it('Cloud Run に渡すのも同じ Variables', () => {
    expect(WORKFLOW).toContain('MFA_MODE=${{ vars.MFA_MODE }}')
  })

  it.each(MFA_MODES)('%s なら通る', (mode) => {
    expect(checkMfa(mode).status).toBe(0)
  })

  it.each([
    ['未設定', undefined],
    ['空', ''],
    ['打ち間違い', 'enrolled-only'],
    ['大文字', 'ALL'],
    ['空白つき', 'all '],
    ['記号を含む', 'all"; echo injected'],
  ])('%s なら落とし、理由を出す', (_label, value) => {
    const result = checkMfa(value)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('::error::')
    expect(result.stdout).not.toContain('injected')
  })

  // ワークフローが通す値は、アプリでもそのまま同じ値になる（ワークフローの方が厳しいのは、前後の空白だけ）
  it.each(['all', 'enrolled_only', 'ALL', 'enrolled-only', 'all ', ''])('%s: ワークフローが通すなら、アプリも同じ値として読む', (value) => {
    if (checkMfa(value).status === 0) expect(parseMfaMode(value)).toBe(value)
  })
})
