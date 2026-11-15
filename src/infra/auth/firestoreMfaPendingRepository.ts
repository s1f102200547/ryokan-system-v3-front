import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { withFirestoreError } from '@/infra/firestoreError'
import type { MfaPending } from '@/domain/auth/mfaPending'
import type { MfaPendingRepository } from '@/domain/ports/mfaPendingRepository'

// SMS の2要素目の途中の状態。gmail-listener は使わないコレクション。
// ドキュメント ID は Cookie の値の SHA-256（DB を読めても Cookie を作れない）。expireAt に Firestore の TTL ポリシーを設定する。
// 期限はアプリでも確かめる（TTL の削除は遅れることがある）
const COLLECTION = 'mfaPending'

const StoredSchema = z.object({
  email: z.string().min(1),
  ip: z.string().nullable(),
  mfaPendingCredential: z.string().min(1),
  sessionInfo: z.string().min(1),
  phoneHint: z.string(),
  expireAt: z.instanceof(Timestamp),
})

export function mfaPendingDocId(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

const refOf = (id: string) => adminDb.collection(COLLECTION).doc(mfaPendingDocId(id))

// 形の崩れたドキュメントは、なかったものとして扱う（「期限切れ。最初からやり直す」になる）
export function toMfaPending(data: unknown): MfaPending | null {
  const parsed = StoredSchema.safeParse(data)
  if (!parsed.success) return null
  const { expireAt, ...rest } = parsed.data
  return { ...rest, expiresAtMs: expireAt.toMillis() }
}

export const firestoreMfaPendingRepository: MfaPendingRepository = {
  async save(id, pending) {
    const { expiresAtMs, ...rest } = pending
    await withFirestoreError(() => refOf(id).set({ ...rest, expireAt: Timestamp.fromMillis(expiresAtMs) }))
  },
  async get(id) {
    return withFirestoreError(async () => {
      const snap = await refOf(id).get()
      return snap.exists ? toMfaPending(snap.data()) : null
    })
  },
  async delete(id) {
    await withFirestoreError(() => refOf(id).delete())
  },
}
