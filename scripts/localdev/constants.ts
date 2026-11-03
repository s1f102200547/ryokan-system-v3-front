// ローカル開発（Firebase Emulator）専用の値。本番とは無関係

// Emulator 専用の開発用ログインユーザー。
// 開発サーバーと Emulator は 127.0.0.1 にだけ bind するので、固定値を docs に書いてよい
export const DEV_USER_EMAIL = 'dev@example.com'
export const DEV_USER_PASSWORD = 'dev-password'
export const DEV_USER_DISPLAY_NAME = '開発用ユーザー'

// 投入するコレクション。ファイル名は `<コレクション名>.json`
export const SEED_COLLECTIONS = ['guestInfoV2', 'dailyInfo'] as const

// 匿名化データの出力先（Git・Docker の対象外）と、fixture の置き場所
export const ANONYMIZED_DATA_DIR = '.localdev/data'
export const FIXTURE_DATA_DIR = 'tests/fixtures/localdev'

// Firestore の batch 書き込みの上限
export const FIRESTORE_BATCH_LIMIT = 500
