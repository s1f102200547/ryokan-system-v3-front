import { DEMO_PROJECT_PREFIX, EMULATOR_HOST_SUFFIX, EMULATOR_HUB_ENV } from '@/constants/runtimeEnv'
import type { Result } from '@/types/result'

type Env = Readonly<Record<string, string | undefined>>

export type SeedTarget = {
  projectId: string
  firestoreHost: string
  authHost: string
}

// 投入は全データを消すので、自分の PC の Emulator だけを相手にする
const LOCAL_HOST_PATTERN = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/

// SEED-1: Emulator 系の変数があり、project ID が demo- で始まるときだけ投入する
export function checkSeedTarget(env: Env): Result<SeedTarget, string[]> {
  const errors: string[] = []
  const firestoreHost = env.FIRESTORE_EMULATOR_HOST || undefined
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST || undefined
  const projectId = env.FIREBASE_PROJECT_ID || undefined

  for (const [name, host] of [['FIRESTORE_EMULATOR_HOST', firestoreHost], ['FIREBASE_AUTH_EMULATOR_HOST', authHost]] as const) {
    if (!host) errors.push(`${name} が設定されていません`)
    else if (!LOCAL_HOST_PATTERN.test(host)) errors.push(`${name} がローカルの Emulator（127.0.0.1 / localhost）を指していません`)
  }
  if (!projectId || !projectId.startsWith(DEMO_PROJECT_PREFIX) || projectId.length <= DEMO_PROJECT_PREFIX.length) {
    errors.push(`FIREBASE_PROJECT_ID が ${DEMO_PROJECT_PREFIX} で始まっていません`)
  }

  if (errors.length > 0 || !firestoreHost || !authHost || !projectId) return { success: false, error: errors }
  return { success: true, value: { projectId, firestoreHost, authHost } }
}

// ANON-5: Emulator 系の変数が1つでもある環境では匿名化を拒否する（Emulator を本番と取り違えないため）
export function checkAnonymizeEnv(env: Env): Result<null, string[]> {
  const found = Object.keys(env).filter((name) =>
    env[name] !== undefined && (name.endsWith(EMULATOR_HOST_SUFFIX) || name === EMULATOR_HUB_ENV))
  return found.length === 0
    ? { success: true, value: null }
    : { success: false, error: found.map((name) => `${name} が設定されています（Emulator 系の変数がある環境では実行しません）`) }
}
