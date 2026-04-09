import type { InfraErrorCode } from '@/types/errors'

export function infraErrorToStatus(code: InfraErrorCode): number {
  switch (code) {
    case 'FIRESTORE_UNAVAILABLE': return 503
    case 'FIRESTORE_PERMISSION':  return 500
    case 'FIRESTORE_DATA_CORRUPTION':  return 500
    case 'AUTH_FAILED':           return 401
    case 'AUTH_UNAVAILABLE':      return 503
    default: {
      // TypeScript の網羅性チェック（新しい InfraErrorCode を追加した際にここがコンパイルエラーになる）
      void (code satisfies never)
      return 500
    }
  }
}
