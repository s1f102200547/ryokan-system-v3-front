// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { checkAnonymizeEnv, checkSeedTarget } from '../../../scripts/localdev/lib/guards'

const EMULATOR_ENV = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_PROJECT_ID: 'demo-ryokan',
}

describe('checkSeedTarget（SEED-1）', () => {
  it('Emulator 系の変数と demo project が揃っていれば投入先を返す', () => {
    expect(checkSeedTarget(EMULATOR_ENV)).toEqual({
      success: true,
      value: { projectId: 'demo-ryokan', firestoreHost: '127.0.0.1:8080', authHost: '127.0.0.1:9099' },
    })
  })

  it.each(['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'])('%s がなければ拒否', (name) => {
    const result = checkSeedTarget({ ...EMULATOR_ENV, [name]: undefined })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.join('\n')).toContain(name)
  })

  it.each(['ryokan-system', 'DEMO-ryokan', 'demo-', '', undefined])('project ID が %s なら拒否', (projectId) => {
    const result = checkSeedTarget({ ...EMULATOR_ENV, FIREBASE_PROJECT_ID: projectId })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.join('\n')).toContain('FIREBASE_PROJECT_ID')
  })

  it('Emulator 系の変数がまったくない環境では拒否（AC-25）', () => {
    expect(checkSeedTarget({ FIREBASE_PROJECT_ID: 'demo-ryokan' }).success).toBe(false)
  })

  it.each(['localhost:8080', '127.0.0.1:8080', '[::1]:8080'])('ローカルの接続先 %s は許可', (host) => {
    expect(checkSeedTarget({ ...EMULATOR_ENV, FIRESTORE_EMULATOR_HOST: host }).success).toBe(true)
  })

  it('ローカル以外の接続先は拒否（他人の Emulator や本番っぽいホストに書かない）', () => {
    const result = checkSeedTarget({ ...EMULATOR_ENV, FIRESTORE_EMULATOR_HOST: 'firestore.googleapis.com:443' })
    expect(result.success).toBe(false)
  })
})

describe('checkAnonymizeEnv（ANON-5, AC-14）', () => {
  it('Emulator 系の変数がなければ実行できる', () => {
    expect(checkAnonymizeEnv({ PATH: '/usr/bin' }).success).toBe(true)
  })

  it.each(['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB', 'FIREBASE_STORAGE_EMULATOR_HOST'])(
    '%s があれば拒否（空文字でも）', (name) => {
      expect(checkAnonymizeEnv({ [name]: '' }).success).toBe(false)
    })
})
