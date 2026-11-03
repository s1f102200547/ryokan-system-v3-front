// 起動時の環境変数チェックで使う名前

// Emulator 専用の project ID の接頭辞。本番リソースに届かない
export const DEMO_PROJECT_PREFIX = 'demo-'

// この接尾辞を持つ変数はすべて Emulator 系として扱う（FIRESTORE_EMULATOR_HOST など）
export const EMULATOR_HOST_SUFFIX = '_EMULATOR_HOST'

// 接尾辞で拾えない Emulator 系の変数
export const EMULATOR_HUB_ENV = 'FIREBASE_EMULATOR_HUB'

// 本番の認証情報。development / test で設定されていたら起動を拒否する
export const PRODUCTION_CREDENTIAL_ENVS = [
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const

// 名前にこれを含む変数も本番の鍵として扱う（過去の NEXT_PUBLIC_FIREBASE_PRIVATE_KEY の誤記を拾う）
export const PRIVATE_KEY_ENV_MARKER = 'PRIVATE_KEY'
