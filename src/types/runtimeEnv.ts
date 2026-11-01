import type { Result } from './result'

// emulator: development / test。Firebase Emulator にだけ接続する
// production: Cloud Run。ADC で本番に接続する
export type RuntimeMode = 'emulator' | 'production'

export type RuntimeEnvViolationCode =
  | 'FIRESTORE_EMULATOR_HOST_MISSING'
  | 'AUTH_EMULATOR_HOST_MISSING'
  | 'BROWSER_AUTH_EMULATOR_HOST_MISSING'
  | 'AUTH_EMULATOR_HOST_MISMATCH'
  | 'PROJECT_ID_NOT_DEMO'
  | 'BROWSER_PROJECT_ID_MISMATCH'
  | 'PRODUCTION_CREDENTIAL_SET'
  | 'EMULATOR_ENV_IN_PRODUCTION'
  | 'DEMO_PROJECT_IN_PRODUCTION'

// 値は含めない（鍵がログに出ないように）。変数名だけを持つ
export type RuntimeEnvViolation = {
  code: RuntimeEnvViolationCode
  envName: string
}

export type RuntimeEnvCheckResult = Result<RuntimeMode, RuntimeEnvViolation[]>

export type RuntimeEnv = Readonly<Record<string, string | undefined>>
