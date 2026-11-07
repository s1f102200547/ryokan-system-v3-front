// @vitest-environment node
// AI エージェント（Claude Code）の設定に、拒否と確認の規則が残っていること。
// 設定はコマンドの書き方を変えれば抜けられる（docs/Security.md §7）ので境界ではないが、
// 誰か（エージェント自身を含む）が規則を消したら気付けるようにする
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

type Settings = {
  permissions?: { deny?: string[]; ask?: string[]; disableBypassPermissionsMode?: string }
}
const settings = JSON.parse(readFileSync(path.resolve(__dirname, '../../../.claude/settings.json'), 'utf8')) as Settings
const deny = settings.permissions?.deny ?? []
const ask = settings.permissions?.ask ?? []

describe('.claude/settings.json', () => {
  it('確認を省くモード（bypassPermissions）を無効にしている', () => {
    expect(settings.permissions?.disableBypassPermissionsMode).toBe('disable')
  })

  // 本番・外部へ出ていく操作と、本番を読む匿名化
  it.each([
    'Bash(git push)', 'Bash(git push *)',
    'Bash(gcloud *)', 'Bash(gh *)',
    'Bash(firebase deploy *)', 'Bash(firebase login *)',
    'Bash(docker push *)', 'Bash(npm publish *)',
    'Bash(npm run anonymize *)', 'Bash(make anonymize)',
  ])('%s を拒否する', (rule) => {
    expect(deny).toContain(rule)
  })

  // 認証情報と本番由来のデータ
  it.each([
    'Read(~/.ssh/**)', 'Read(~/.config/gcloud/**)', 'Read(~/.config/configstore/**)',
    'Read(.env)', 'Read(.env.*)', 'Read(.localdev/**)', 'Read(gha-creds-*.json)', 'Read(*.pem)',
  ])('%s を拒否する', (rule) => {
    expect(deny).toContain(rule)
  })

  it('CI の定義の編集は毎回確認する', () => {
    expect(ask).toContain('Edit(.github/workflows/**)')
  })

  it('拒否している操作を allow で許していない', () => {
    const allow = (settings.permissions as { allow?: string[] } | undefined)?.allow ?? []
    expect(allow.filter((rule) => deny.includes(rule))).toEqual([])
  })
})
