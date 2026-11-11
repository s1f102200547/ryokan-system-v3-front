import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { withFirestoreError } from '@/infra/firestoreError'
import { recordFailure, type ThrottleState } from '@/domain/auth/loginThrottle'
import { LOGIN_FAILURE_RESET_MS, LOGIN_LOCK_STEPS } from '@/constants/auth'
import type { LoginThrottleRepository, ThrottleKey } from '@/domain/ports/loginThrottleRepository'

// ログインの失敗回数（メールアドレスごと・IP ごと）。gmail-listener は使わないコレクション。
// ドキュメント ID は値のハッシュにする（DB にメールアドレス・IP をそのまま置かない）
const COLLECTION = 'loginThrottle'
// TTL（Firestore の TTL ポリシーを expireAt に設定する）。数え直す時間と、いちばん長く止める時間の後に消す
const EXPIRE_AFTER_MS = LOGIN_FAILURE_RESET_MS + Math.max(...LOGIN_LOCK_STEPS.map((s) => s.lockMs))

const StoredSchema = z.object({
  failures: z.number().int().min(0),
  lastFailureAt: z.instanceof(Timestamp),
  lockedUntil: z.instanceof(Timestamp),
})

export function throttleDocId(key: ThrottleKey): string {
  const value = key.kind === 'email' ? key.value.trim().toLowerCase() : key.value
  return createHash('sha256').update(`${key.kind}:${value}`).digest('hex')
}

// 形の崩れたドキュメントは、なかったものとして扱う（止めない側に倒すが、次の失敗で正しい形に書き直す）
function toState(data: unknown): ThrottleState | null {
  const parsed = StoredSchema.safeParse(data)
  if (!parsed.success) return null
  return {
    failures: parsed.data.failures,
    lastFailureAtMs: parsed.data.lastFailureAt.toMillis(),
    lockedUntilMs: parsed.data.lockedUntil.toMillis(),
  }
}

const refOf = (key: ThrottleKey) => adminDb.collection(COLLECTION).doc(throttleDocId(key))

export const firestoreLoginThrottleRepository: LoginThrottleRepository = {
  async read(keys) {
    if (keys.length === 0) return []
    return withFirestoreError(async () => {
      const snaps = await adminDb.getAll(...keys.map(refOf))
      return snaps.map((snap) => (snap.exists ? toState(snap.data()) : null))
    })
  },

  async recordFailure(keys, nowMs) {
    if (keys.length === 0) return []
    return withFirestoreError(() => adminDb.runTransaction(async (tx) => {
      const refs = keys.map(refOf)
      const snaps = await tx.getAll(...refs)
      return refs.map((ref, i) => {
        const { next, lockMs } = recordFailure(snaps[i].exists ? toState(snaps[i].data()) : null, nowMs)
        tx.set(ref, {
          failures: next.failures,
          lastFailureAt: Timestamp.fromMillis(next.lastFailureAtMs),
          lockedUntil: Timestamp.fromMillis(next.lockedUntilMs),
          expireAt: Timestamp.fromMillis(nowMs + EXPIRE_AFTER_MS),
        })
        return { lockMs, failures: next.failures }
      })
    }))
  },

  async reset(keys) {
    if (keys.length === 0) return
    await withFirestoreError(async () => {
      const batch = adminDb.batch()
      for (const key of keys) batch.delete(refOf(key))
      await batch.commit()
    })
  },
}
