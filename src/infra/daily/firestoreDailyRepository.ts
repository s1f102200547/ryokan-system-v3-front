import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { InfraError } from '@/types/errors'
import { withFirestoreError } from '@/infra/firestoreError'
import type { DailyRepository } from '@/domain/ports/dailyRepository'

const DailyTodoSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(100),
})

const DailyTodosSchema = z.array(DailyTodoSchema)

export const firestoreDailyRepository: DailyRepository = {
  async updateSafeBalanceChecker(date, staffName) {
    return withFirestoreError(async () => {
      await adminDb.collection('dailyInfo').doc(date).set(
        { date, safeBalanceChecker: staffName, updated_at: new Date().toISOString() },
        { merge: true },
      )
    })
  },

  async fetchSafeBalanceCheckers(dates) {
    if (dates.length === 0) return {}
    return withFirestoreError(async () => {
      const refs = dates.map((d) => adminDb.collection('dailyInfo').doc(d))
      const snaps = await adminDb.getAll(...refs)
      const result: Record<string, string> = {}
      for (let i = 0; i < dates.length; i++) {
        const data = snaps[i].data()
        result[dates[i]] = typeof data?.safeBalanceChecker === 'string' ? data.safeBalanceChecker : ''
      }
      return result
    })
  },

  async fetchDailyTodos(date) {
    return withFirestoreError(async () => {
      const snap = await adminDb.collection('dailyInfo').doc(date).get()
      const data = snap.data()
      if (!Array.isArray(data?.todos)) return []
      const parsed = DailyTodosSchema.safeParse(data.todos)
      if (!parsed.success) {
        throw new InfraError('FIRESTORE_DATA_CORRUPTION', 'todos フィールドの形式が不正', parsed.error)
      }
      return parsed.data
    })
  },

  async updateDailyTodos(date, todos) {
    return withFirestoreError(async () => {
      await adminDb.collection('dailyInfo').doc(date).set(
        { date, todos, updated_at: new Date().toISOString() },
        { merge: true },
      )
    })
  },
}

