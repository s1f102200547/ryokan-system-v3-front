import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { withFirestoreError } from '@/infra/firestoreError'
import { consumeSms, type SmsQuotaState } from '@/domain/auth/smsQuota'
import type { SmsQuotaRepository } from '@/domain/ports/smsQuotaRepository'

// 1アカウントが1日に送った SMS の数。gmail-listener は使わないコレクション。
// ドキュメント ID は sha256("email:" + 小文字のメールアドレス)（loginThrottle と同じ形。生のメールアドレスは置かない）。
// 前の日の数は次に送るときに上書きする。使われなくなったアカウントの分は expireAt（TTL ポリシー）で消える
const COLLECTION = 'mfaSmsQuota'
const EXPIRE_AFTER_MS = 2 * 24 * 60 * 60 * 1000

const StoredSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(0),
})

export function smsQuotaDocId(email: string): string {
  return createHash('sha256').update(`email:${email.trim().toLowerCase()}`).digest('hex')
}

// 形の崩れたドキュメントは、なかったものとして扱う（次に書くときに正しい形に書き直す）
function toState(data: unknown): SmsQuotaState | null {
  const parsed = StoredSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

export const firestoreSmsQuotaRepository: SmsQuotaRepository = {
  async consume(email, today) {
    return withFirestoreError(() => adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection(COLLECTION).doc(smsQuotaDocId(email))
      const snap = await tx.get(ref)
      const decision = consumeSms(snap.exists ? toState(snap.data()) : null, today)
      tx.set(ref, { ...decision.next, expireAt: Timestamp.fromMillis(Date.now() + EXPIRE_AFTER_MS) })
      return decision
    }))
  },
}
