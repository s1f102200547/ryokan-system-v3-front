// @vitest-environment node
// AI エージェント（Claude Code）の設定に、拒否と確認の規則が残っていること。
// 設定はコマンドの書き方を変えれば抜けられる（docs/Security.md §7）ので境界ではないが、
// 誰か（エージェント自身を含む）が規則を消したら気付けるようにする
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

type Settings = {
  permissions?: { deny?: string[]; ask?: string[]; disableBypassPermissionsMode?: string }
  sandbox?: {
    enabled?: boolean
    failIfUnavailable?: boolean
    allowUnsandboxedCommands?: boolean
    network?: { allowedDomains?: string[] }
    filesystem?: { denyWrite?: string[] }
  }
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
    'Read(~/.config/gh/**)', 'Read(~/.npmrc)', 'Read(~/.git-credentials)', 'Read(~/.docker/config.json)',
    'Read(~/.claude/.credentials.json)',
  ])('%s を拒否する', (rule) => {
    expect(deny).toContain(rule)
  })

  // Bash のサンドボックス。上の拒否の一覧（書き方を変えれば抜けられる）に対して、こちらは許可リスト。
  // Read の拒否はサンドボックスの読み取り禁止にも合わさる。許可していない通信先は毎回確認になる
  describe('サンドボックス', () => {
    const sandbox = settings.sandbox

    it('有効にしている', () => {
      expect(sandbox?.enabled).toBe(true)
    })

    // 既定では、bubblewrap・socat がないと警告だけ出してサンドボックスなしで動く。気付かないまま外れないよう、起動を止める
    it('サンドボックスが動かないときは Claude Code を起動しない', () => {
      expect(sandbox?.failIfUnavailable).toBe(true)
    })

    it('エージェントがサンドボックスの外でコマンドを動かせない（dangerouslyDisableSandbox を無視する）', () => {
      expect(sandbox?.allowUnsandboxedCommands).toBe(false)
    })

    it('確認なしで通信できる先は npm と GitHub だけ', () => {
      expect([...(sandbox?.network?.allowedDomains ?? [])].sort()).toEqual(['github.com', 'registry.npmjs.org'])
    })

    it('Bash から CI の定義を書き換えられない（Edit なら毎回確認になる）', () => {
      expect(sandbox?.filesystem?.denyWrite).toContain('.github/workflows')
    })
  })

  it('CI の定義の編集は毎回確認する', () => {
    expect(ask).toContain('Edit(.github/workflows/**)')
  })

  // 規則に「!」で打ち消す書き方はない。Read(!x) は「!x という名前のパス」を拒否するだけで、x は許されない（2026-11 にサンドボックスで確認）
  it('「!」で始まる規則を書いていない（除外のつもりで効かない）', () => {
    expect([...deny, ...ask].filter((rule) => /^\w+\(!/.test(rule))).toEqual([])
  })

  it('拒否している操作を allow で許していない', () => {
    const allow = (settings.permissions as { allow?: string[] } | undefined)?.allow ?? []
    expect(allow.filter((rule) => deny.includes(rule))).toEqual([])
  })
})
