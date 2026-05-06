import { adminDb } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'
import type { DailyRepository } from '@/domain/ports/dailyRepository'

export const firestoreDailyRepository: DailyRepository = {
  async updateSafeBalanceChecker(date, staffName) {
    return withFirestoreError(async () => {
      // ドキュメント未存在時は新規作成、存在時はフィールドをマージ
      await adminDb.collection('daily').doc(date).set(
        { safeBalanceChecker: staffName, updated_at: new Date().toISOString() },
        { merge: true },
      )
    })
  },
}

async function withFirestoreError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof InfraError) throw e
    const code = (e as { code?: number }).code
    if (code === 14) throw new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unreachable', e)
    if (code === 7) throw new InfraError('FIRESTORE_PERMISSION', 'Firestore permission denied', e)
    throw new InfraError('FIRESTORE_UNAVAILABLE', 'Firestore unknown error', e)
  }
}
