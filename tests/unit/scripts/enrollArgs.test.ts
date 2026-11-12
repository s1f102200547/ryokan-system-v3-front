import { describe, it, expect } from 'vitest'
import { maskPhone, parseEnrollArgs } from '../../../scripts/mfa/lib/enrollArgs'

const prod = { emulator: false }
const emu = { emulator: true }

describe('parseEnrollArgs', () => {
  it('一覧', () => {
    expect(parseEnrollArgs(['--project', 'ryokan-x', '--list'], prod)).toEqual({ success: true, value: { kind: 'list', projectId: 'ryokan-x' } })
  })

  it('登録（空白・ハイフンは除く）', () => {
    expect(parseEnrollArgs(['--project', 'ryokan-x', '--email', 'pc1@example.com', '--phone', '+81 90-1234-5678'], prod))
      .toEqual({ success: true, value: { kind: 'enroll', projectId: 'ryokan-x', email: 'pc1@example.com', phoneNumber: '+819012345678' } })
  })

  it('外す', () => {
    expect(parseEnrollArgs(['--project', 'ryokan-x', '--email', 'pc1@example.com', '--remove'], prod))
      .toEqual({ success: true, value: { kind: 'remove', projectId: 'ryokan-x', email: 'pc1@example.com' } })
  })

  it('Emulator なら架空の +1 555 も登録できる', () => {
    expect(parseEnrollArgs(['--project', 'demo-ryokan', '--email', 'dev@example.com', '--phone', '+15555550100'], emu).success).toBe(true)
  })

  it.each([
    ['project なし', ['--list'], prod],
    ['project の値なし', ['--project', '--list'], prod],
    ['本番で demo- の project', ['--project', 'demo-ryokan', '--list'], prod],
    ['Emulator で本番の project', ['--project', 'ryokan-x', '--list'], emu],
    ['どれもなし', ['--project', 'ryokan-x'], prod],
    ['2つ', ['--project', 'ryokan-x', '--list', '--remove'], prod],
    ['email なしで登録', ['--project', 'ryokan-x', '--phone', '+819012345678'], prod],
    ['--list に email', ['--project', 'ryokan-x', '--list', '--email', 'a@b'], prod],
    ['+ がない', ['--project', 'ryokan-x', '--email', 'a@b', '--phone', '09012345678'], prod],
    ['本番で日本以外', ['--project', 'ryokan-x', '--email', 'a@b', '--phone', '+15555550100'], prod],
    ['知らない引数', ['--project', 'ryokan-x', '--list', '--force'], prod],
  ] as const)('%s は断る', (_label, argv, env) => {
    expect(parseEnrollArgs(argv, env).success).toBe(false)
  })
})

describe('maskPhone', () => {
  it('末尾4桁だけを出す', () => {
    expect(maskPhone('+819012345678')).toBe('*********5678')
    expect(maskPhone('123')).toBe('****')
  })
})
