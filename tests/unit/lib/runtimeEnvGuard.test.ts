import { describe, it, expect } from 'vitest'
import { checkRuntimeEnv, formatRuntimeEnvViolations } from '@/lib/firebase/runtimeEnvGuard'
import type { RuntimeEnv, RuntimeEnvViolationCode } from '@/types/runtimeEnv'

const EMULATOR_ENV: RuntimeEnv = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_PROJECT_ID: 'demo-ryokan',
}

const PRODUCTION_ENV: RuntimeEnv = {
  FIREBASE_AUTH_API_KEY: 'prod-api-key',
  SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x',
}

function violationCodes(env: RuntimeEnv, nodeEnv: string | undefined): RuntimeEnvViolationCode[] {
  const result = checkRuntimeEnv(env, nodeEnv)
  return result.success ? [] : result.error.map((v) => v.code)
}

describe.each(['development', 'test'])('checkRuntimeEnv: NODE_ENV=%s', (nodeEnv) => {
  it('全条件を満たすと emulator モード', () => {
    expect(checkRuntimeEnv(EMULATOR_ENV, nodeEnv)).toEqual({ success: true, value: 'emulator' })
  })

  it.each([
    ['FIRESTORE_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST_MISSING'],
    ['FIREBASE_AUTH_EMULATOR_HOST', 'AUTH_EMULATOR_HOST_MISSING'],
    ['FIREBASE_PROJECT_ID', 'PROJECT_ID_NOT_DEMO'],
  ] as const)('%s がないと拒否（%s）', (name, code) => {
    const env = { ...EMULATOR_ENV, [name]: undefined }
    expect(violationCodes(env, nodeEnv)).toContain(code)
  })

  it.each([
    ['FIRESTORE_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST_MISSING'],
    ['FIREBASE_PROJECT_ID', 'PROJECT_ID_NOT_DEMO'],
  ] as const)('%s が空文字でも未設定として拒否', (name, code) => {
    const env = { ...EMULATOR_ENV, [name]: '' }
    expect(violationCodes(env, nodeEnv)).toContain(code)
  })

  it.each(['ryokan-prod', 'DEMO-ryokan', 'xdemo-ryokan', 'demo-'])(
    'project ID が %s なら拒否',
    (projectId) => {
      const env = { ...EMULATOR_ENV, FIREBASE_PROJECT_ID: projectId }
      expect(violationCodes(env, nodeEnv)).toEqual(['PROJECT_ID_NOT_DEMO'])
    },
  )

  it.each([
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'NEXT_PUBLIC_FIREBASE_PRIVATE_KEY',
    'OTHER_PRIVATE_KEY_PATH',
  ])('本番の認証情報 %s が設定されていると拒否', (name) => {
    const env = { ...EMULATOR_ENV, [name]: 'secret' }
    expect(checkRuntimeEnv(env, nodeEnv)).toEqual({
      success: false,
      error: [{ code: 'PRODUCTION_CREDENTIAL_SET', envName: name }],
    })
  })

  it('本番の認証情報は空文字でも拒否', () => {
    const env = { ...EMULATOR_ENV, FIREBASE_PRIVATE_KEY: '' }
    expect(violationCodes(env, nodeEnv)).toEqual(['PRODUCTION_CREDENTIAL_SET'])
  })

  it('違反をすべて列挙する', () => {
    expect(violationCodes({ FIREBASE_PRIVATE_KEY: 'secret' }, nodeEnv)).toEqual([
      'FIRESTORE_EMULATOR_HOST_MISSING',
      'AUTH_EMULATOR_HOST_MISSING',
      'PROJECT_ID_NOT_DEMO',
      'PRODUCTION_CREDENTIAL_SET',
    ])
  })
})

describe('checkRuntimeEnv: NODE_ENV=production', () => {
  it('Emulator 系も demo- もなければ production モード', () => {
    expect(checkRuntimeEnv(PRODUCTION_ENV, 'production')).toEqual({ success: true, value: 'production' })
  })

  it('何も設定しなくても production モード（CI の ZAP job と同じ）', () => {
    expect(checkRuntimeEnv({}, 'production')).toEqual({ success: true, value: 'production' })
  })

  it.each([
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'FIREBASE_EMULATOR_HUB',
  ])('Emulator 系の %s が1つでもあれば拒否', (name) => {
    const env = { ...PRODUCTION_ENV, [name]: '127.0.0.1:1' }
    expect(checkRuntimeEnv(env, 'production')).toEqual({
      success: false,
      error: [{ code: 'EMULATOR_ENV_IN_PRODUCTION', envName: name }],
    })
  })

  it('Emulator 系の変数は空文字でも拒否', () => {
    const env = { ...PRODUCTION_ENV, FIRESTORE_EMULATOR_HOST: '' }
    expect(violationCodes(env, 'production')).toEqual(['EMULATOR_ENV_IN_PRODUCTION'])
  })

  it('FIREBASE_PROJECT_ID が demo- 始まりなら拒否', () => {
    const env = { ...PRODUCTION_ENV, FIREBASE_PROJECT_ID: 'demo-ryokan' }
    expect(checkRuntimeEnv(env, 'production')).toEqual({
      success: false,
      error: [{ code: 'DEMO_PROJECT_IN_PRODUCTION', envName: 'FIREBASE_PROJECT_ID' }],
    })
  })

  it('production では鍵の有無を見ない（Cloud Run は ADC）', () => {
    const env = { ...PRODUCTION_ENV, GOOGLE_APPLICATION_CREDENTIALS: '/secrets/sa.json' }
    expect(checkRuntimeEnv(env, 'production')).toEqual({ success: true, value: 'production' })
  })
})

describe.each([undefined, '', 'staging'])('checkRuntimeEnv: NODE_ENV=%s', (nodeEnv) => {
  it('production と同じ規則で検査する（安全側）', () => {
    expect(checkRuntimeEnv(EMULATOR_ENV, nodeEnv)).toEqual({
      success: false,
      error: [
        { code: 'EMULATOR_ENV_IN_PRODUCTION', envName: 'FIRESTORE_EMULATOR_HOST' },
        { code: 'EMULATOR_ENV_IN_PRODUCTION', envName: 'FIREBASE_AUTH_EMULATOR_HOST' },
        { code: 'DEMO_PROJECT_IN_PRODUCTION', envName: 'FIREBASE_PROJECT_ID' },
      ],
    })
  })
})

describe('formatRuntimeEnvViolations', () => {
  it('変数名を含み、値を含まない', () => {
    const env = { ...EMULATOR_ENV, FIREBASE_PRIVATE_KEY: 'super-secret-value' }
    const result = checkRuntimeEnv(env, 'development')
    if (result.success) throw new Error('違反になるはず')
    const message = formatRuntimeEnvViolations(result.error)
    expect(message).toContain('FIREBASE_PRIVATE_KEY')
    expect(message).not.toContain('super-secret-value')
  })
})
