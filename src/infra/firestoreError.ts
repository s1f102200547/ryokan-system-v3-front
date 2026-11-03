import { InfraError } from '@/types/errors'

// gRPC のステータスコード（Firestore の Admin SDK が投げるエラーの code）
const GRPC_NOT_FOUND = 5
const GRPC_PERMISSION_DENIED = 7
const GRPC_UNAVAILABLE = 14

// Firestore の例外を InfraError に変換する。元の例外は cause に残す（ログで原因を追えるように）
export function toInfraError(e: unknown): InfraError {
  if (e instanceof InfraError) return e
  const code = (e as { code?: unknown } | null)?.code
  if (code === GRPC_UNAVAILABLE) return new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable', e)
  if (code === GRPC_PERMISSION_DENIED) return new InfraError('FIRESTORE_PERMISSION', 'Firestore permission denied', e)
  // 存在しないドキュメントへの update()。入力が原因なので障害にしない
  if (code === GRPC_NOT_FOUND) return new InfraError('FIRESTORE_NOT_FOUND', 'Firestore document not found', e)
  return new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unknown error', e)
}

export async function withFirestoreError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw toInfraError(e)
  }
}
