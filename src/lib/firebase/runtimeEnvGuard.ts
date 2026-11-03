import {
  DEMO_PROJECT_PREFIX,
  EMULATOR_HOST_SUFFIX,
  EMULATOR_HUB_ENV,
  PRIVATE_KEY_ENV_MARKER,
  PRODUCTION_CREDENTIAL_ENVS,
} from '@/constants/runtimeEnv'
import type {
  RuntimeEnv,
  RuntimeEnvCheckResult,
  RuntimeEnvViolation,
  RuntimeMode,
} from '@/types/runtimeEnv'

// 起動時の環境変数チェック
// development / test: Emulator にだけ接続できる設定でなければ拒否
// それ以外（production、未設定など）: Emulator 系・demo project が混ざっていれば拒否
export function checkRuntimeEnv(env: RuntimeEnv, nodeEnv: string | undefined): RuntimeEnvCheckResult {
  const isEmulatorMode = nodeEnv === 'development' || nodeEnv === 'test'
  const mode: RuntimeMode = isEmulatorMode ? 'emulator' : 'production'
  const violations = isEmulatorMode ? checkEmulatorEnv(env) : checkProductionEnv(env)
  return violations.length === 0 ? { success: true, value: mode } : { success: false, error: violations }
}

function checkEmulatorEnv(env: RuntimeEnv): RuntimeEnvViolation[] {
  const violations: RuntimeEnvViolation[] = []

  // 必須の変数は空文字を未設定とみなす
  const firestoreHost = env.FIRESTORE_EMULATOR_HOST || undefined
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST || undefined
  const browserAuthHost = env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || undefined
  const projectId = env.FIREBASE_PROJECT_ID || undefined
  const browserProjectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || undefined

  if (!firestoreHost) {
    violations.push({ code: 'FIRESTORE_EMULATOR_HOST_MISSING', envName: 'FIRESTORE_EMULATOR_HOST' })
  }
  if (!authHost) {
    violations.push({ code: 'AUTH_EMULATOR_HOST_MISSING', envName: 'FIREBASE_AUTH_EMULATOR_HOST' })
  }
  if (!browserAuthHost) {
    violations.push({
      code: 'BROWSER_AUTH_EMULATOR_HOST_MISSING',
      envName: 'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST',
    })
  }
  // ブラウザとサーバーで接続先がずれると、トークン検証が分かりにくい形で失敗する
  if (authHost && browserAuthHost && authHost !== browserAuthHost) {
    violations.push({ code: 'AUTH_EMULATOR_HOST_MISMATCH', envName: 'NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST' })
  }
  if (!isDemoProjectId(projectId)) {
    violations.push({ code: 'PROJECT_ID_NOT_DEMO', envName: 'FIREBASE_PROJECT_ID' })
  }
  if (!browserProjectId || browserProjectId !== projectId) {
    violations.push({ code: 'BROWSER_PROJECT_ID_MISMATCH', envName: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID' })
  }

  // 本番の認証情報は空文字でも拒否する（置き場所自体を残さない）
  for (const name of definedEnvNames(env)) {
    if (isProductionCredentialEnv(name)) {
      violations.push({ code: 'PRODUCTION_CREDENTIAL_SET', envName: name })
    }
  }

  return violations
}

function checkProductionEnv(env: RuntimeEnv): RuntimeEnvViolation[] {
  const violations: RuntimeEnvViolation[] = []

  // Admin SDK は Auth Emulator の接続先があるとトークンの署名を検証しない。空文字でも拒否する
  for (const name of definedEnvNames(env)) {
    if (isEmulatorEnv(name)) {
      violations.push({ code: 'EMULATOR_ENV_IN_PRODUCTION', envName: name })
    }
  }

  for (const name of ['FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'] as const) {
    if (env[name]?.startsWith(DEMO_PROJECT_PREFIX)) {
      violations.push({ code: 'DEMO_PROJECT_IN_PRODUCTION', envName: name })
    }
  }

  return violations
}

function definedEnvNames(env: RuntimeEnv): string[] {
  return Object.keys(env).filter((name) => env[name] !== undefined)
}

export function isDemoProjectId(projectId: string | undefined): boolean {
  return projectId !== undefined
    && projectId.startsWith(DEMO_PROJECT_PREFIX)
    && projectId.length > DEMO_PROJECT_PREFIX.length
}

export function isEmulatorEnv(name: string): boolean {
  return name.endsWith(EMULATOR_HOST_SUFFIX) || name === EMULATOR_HUB_ENV
}

function isProductionCredentialEnv(name: string): boolean {
  return (PRODUCTION_CREDENTIAL_ENVS as readonly string[]).includes(name)
    || name.includes(PRIVATE_KEY_ENV_MARKER)
}

export function formatRuntimeEnvViolations(violations: RuntimeEnvViolation[]): string {
  const lines = violations.map((v) => `  - ${v.code}: ${v.envName}`)
  return [
    '環境変数の設定が起動条件（docs/Development.md「起動ガード」）を満たしていないため、起動を拒否しました。',
    ...lines,
  ].join('\n')
}

// process.env を検査用に読み出す。
// NEXT_PUBLIC_* は build 時にインライン化され、production では process.env を走査しても見えない。
// 名前を直接書いて参照することで、build 時に埋め込まれた値も検査の対象にする
function readRuntimeEnv(): RuntimeEnv {
  return {
    ...process.env,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  }
}

// 起動条件を満たさなければ throw する。instrumentation.ts と admin.ts から呼ぶ
export function assertRuntimeEnv(): RuntimeMode {
  const result = checkRuntimeEnv(readRuntimeEnv(), process.env.NODE_ENV)
  if (!result.success) {
    throw new Error(formatRuntimeEnvViolations(result.error))
  }
  return result.value
}
