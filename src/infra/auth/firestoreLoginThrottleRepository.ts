import { createHash } from 'node:crypto'
import { Timestamp, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { withFirestoreError } from '@/infra/firestoreError'
import { acquireAll, completeAttempt, type ThrottleState } from '@/domain/auth/loginThrottle'
import { LOGIN_BUSY_RETRY_MS, LOGIN_FAILURE_RESET_MS, LOGIN_LOCK_STEPS } from '@/constants/auth'
import type { LoginThrottleRepository, ThrottleKey } from '@/domain/ports/loginThrottleRepository'

// ログインの失敗回数（メールアドレスごと・IP ごと）と試行中の札。gmail-listener は使わないコレクション。
// ドキュメント ID は値のハッシュにする（DB にメールアドレス・IP をそのまま置かない）
const COLLECTION = 'loginThrottle'
// TTL（Firestore の TTL ポリシーを expireAt に設定する）。数え直す時間と、いちばん長く止める時間の後に消す
const EXPIRE_AFTER_MS = LOGIN_FAILURE_RESET_MS + Math.max(...LOGIN_LOCK_STEPS.map((s) => s.lockMs))
// gRPC の ABORTED。同じドキュメントへのトランザクションがぶつかり合い、SDK がやり直しを諦めたとき
const GRPC_ABORTED = 10

const StoredSchema = z.object({
  failures: z.number().int().min(0),
  lastFailureAt: z.instanceof(Timestamp),
  lockedUntil: z.instanceof(Timestamp),
  // 札を入れる前のドキュメントにはない
  pending: z.array(z.object({ id: z.string(), expiresAt: z.instanceof(Timestamp) })).max(20).optional(),
})

export function throttleDocId(key: ThrottleKey): string {
  const value = key.kind === 'email' ? key.value.trim().toLowerCase() : key.value
  return createHash('sha256').update(`${key.kind}:${value}`).digest('hex')
}

// 形の崩れたドキュメントは、なかったものとして扱う（止めない側に倒すが、次に書くときに正しい形に書き直す）
function toState(data: unknown): ThrottleState | null {
  const parsed = StoredSchema.safeParse(data)
  if (!parsed.success) return null
  return {
    failures: parsed.data.failures,
    lastFailureAtMs: parsed.data.lastFailureAt.toMillis(),
    lockedUntilMs: parsed.data.lockedUntil.toMillis(),
    pending: (parsed.data.pending ?? []).map((p) => ({ id: p.id, expiresAtMs: p.expiresAt.toMillis() })),
  }
}

const refOf = (key: ThrottleKey) => adminDb.collection(COLLECTION).doc(throttleDocId(key))

function writeState(tx: Transaction, ref: DocumentReference, state: ThrottleState | null, nowMs: number) {
  if (state === null) {
    tx.delete(ref)
    return
  }
  tx.set(ref, {
    failures: state.failures,
    lastFailureAt: Timestamp.fromMillis(state.lastFailureAtMs),
    lockedUntil: Timestamp.fromMillis(state.lockedUntilMs),
    pending: state.pending.map((p) => ({ id: p.id, expiresAt: Timestamp.fromMillis(p.expiresAtMs) })),
    expireAt: Timestamp.fromMillis(Math.max(state.lastFailureAtMs, nowMs) + EXPIRE_AFTER_MS),
  })
}

function isAborted(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === GRPC_ABORTED
}

async function readStates(tx: Transaction, refs: DocumentReference[]): Promise<(ThrottleState | null)[]> {
  const snaps = await tx.getAll(...refs)
  return snaps.map((snap) => (snap.exists ? toState(snap.data()) : null))
}

export const firestoreLoginThrottleRepository: LoginThrottleRepository = {
  async read(keys) {
    if (keys.length === 0) return []
    return withFirestoreError(async () => {
      const snaps = await adminDb.getAll(...keys.map(refOf))
      return snaps.map((snap) => (snap.exists ? toState(snap.data()) : null))
    })
  },

  async acquire(keys, nowMs, attemptId) {
    if (keys.length === 0) return { success: true, value: undefined }
    try {
      return await withFirestoreError(() => adminDb.runTransaction(async (tx) => {
        const refs = keys.map(refOf)
        const result = acquireAll(await readStates(tx, refs), nowMs, attemptId)
        // 断るときは何も書かない（止めている間は数えない）
        if (!result.success) return result
        refs.forEach((ref, i) => writeState(tx, ref, result.value[i], nowMs))
        return { success: true as const, value: undefined }
      }))
    } catch (e) {
      // 同時の試行が多すぎてぶつかり合った。入力（大量の同時送信）が原因なので、障害にせず「少し待って」にする
      if (isAborted((e as { cause?: unknown }).cause) || isAborted(e)) {
        return { success: false, error: { kind: 'busy', retryAfterMs: LOGIN_BUSY_RETRY_MS } }
      }
      throw e
    }
  },

  async complete(keys, attemptId, outcome, nowMs) {
    if (keys.length === 0) return []
    return withFirestoreError(() => adminDb.runTransaction(async (tx) => {
      const refs = keys.map(refOf)
      const states = await readStates(tx, refs)
      return refs.map((ref, i) => {
        const { next, lockMs, failures } = completeAttempt(states[i], attemptId, outcome, nowMs)
        writeState(tx, ref, next, nowMs)
        return { lockMs, failures }
      })
    }))
  },
}
