import { createHash } from 'node:crypto'
import { Timestamp, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { withFirestoreError } from '@/infra/firestoreError'
import { acquireAttempt, refundFailure, type ThrottleState } from '@/domain/auth/loginThrottle'
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

function writeState(tx: Transaction, ref: DocumentReference, state: ThrottleState, lastFailureAtMs: number) {
  tx.set(ref, {
    failures: state.failures,
    lastFailureAt: Timestamp.fromMillis(state.lastFailureAtMs),
    lockedUntil: Timestamp.fromMillis(state.lockedUntilMs),
    expireAt: Timestamp.fromMillis(lastFailureAtMs + EXPIRE_AFTER_MS),
  })
}

export const firestoreLoginThrottleRepository: LoginThrottleRepository = {
  async read(keys) {
    if (keys.length === 0) return []
    return withFirestoreError(async () => {
      const snaps = await adminDb.getAll(...keys.map(refOf))
      return snaps.map((snap) => (snap.exists ? toState(snap.data()) : null))
    })
  },

  async acquire(keys, nowMs) {
    if (keys.length === 0) return { success: true, value: [] }
    return withFirestoreError(() => adminDb.runTransaction(async (tx) => {
      const refs = keys.map(refOf)
      const snaps = await tx.getAll(...refs)
      const states = snaps.map((snap) => (snap.exists ? toState(snap.data()) : null))
      const attempts = states.map((state) => acquireAttempt(state, nowMs))
      // どれかが止まっていれば、何も書かない（止めている間は数えない）
      const retryAfterMs = Math.max(0, ...attempts.map((a) => (a.success ? 0 : a.error.retryAfterMs)))
      if (retryAfterMs > 0) return { success: false as const, error: { retryAfterMs } }
      return {
        success: true as const,
        value: refs.map((ref, i) => {
          const attempt = attempts[i]
          if (!attempt.success) throw new Error('unreachable') // retryAfterMs が 0 なら、すべて success
          writeState(tx, ref, attempt.value.next, nowMs)
          return { lockMs: attempt.value.lockMs, failures: attempt.value.next.failures, previous: states[i] }
        }),
      }
    }))
  },

  async refund(keys, acquired, nowMs) {
    if (keys.length === 0) return
    await withFirestoreError(() => adminDb.runTransaction(async (tx) => {
      const refs = keys.map(refOf)
      const snaps = await tx.getAll(...refs)
      refs.forEach((ref, i) => {
        const next = refundFailure(snaps[i].exists ? toState(snaps[i].data()) : null, acquired[i]?.previous ?? null, nowMs)
        if (next === null) tx.delete(ref)
        else writeState(tx, ref, next, next.lastFailureAtMs)
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
