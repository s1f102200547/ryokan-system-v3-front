export type InfraErrorCode =
  | 'FIRESTORE_UNAVAILABLE'
  | 'FIRESTORE_PERMISSION'
  | 'FIRESTORE_VALIDATION'
  | 'AUTH_FAILED'
  | 'AUTH_UNAVAILABLE'

export class InfraError extends Error { // js標準のErrorを拡張, code: errorの種類, couse: 元のエラー <- Firestoreのエラーをそのまま保持可
  readonly code: InfraErrorCode
  readonly cause?: unknown

  constructor(code: InfraErrorCode, message: string, cause?: unknown) {
    super(message)          //親クラス(Error)にmessageを渡す
    this.name = 'InfraError'
    this.code = code
    this.cause = cause
  }
}
