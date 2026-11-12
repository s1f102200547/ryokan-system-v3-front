// @vitest-environment node
// SMS の2要素目の途中の状態と、SMS の通数を、本物の Firestore Emulator に書いて読み戻す
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminDb } from '@/lib/firebase/admin'
import { firestoreMfaPendingRepository, mfaPendingDocId } from '@/infra/auth/firestoreMfaPendingRepository'
import { firestoreSmsQuotaRepository, smsQuotaDocId } from '@/infra/auth/firestoreSmsQuotaRepository'
import { MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

const RUN_ID = `emutest-mfa-${Date.now()}`
const clear = async () => {
  await adminDb.recursiveDelete(adminDb.collection('mfaPending'))
  await adminDb.recursiveDelete(adminDb.collection('mfaSmsQuota'))
}

beforeAll(async () => {
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
  await clear()
})
afterAll(clear)

describe('firestoreMfaPendingRepository', () => {
  it('保存して読み戻し、消すと null。ID は Cookie の値のハッシュ', async () => {
    const id = `${RUN_ID}-pending`
    const pending = {
      email: `${RUN_ID}@example.com`, ip: '203.0.113.5', mfaPendingCredential: 'pc', sessionInfo: 'si', phoneHint: '+1*******0100',
      expiresAtMs: Date.now() + 60_000,
    }
    await firestoreMfaPendingRepository.save(id, pending)
    expect(await firestoreMfaPendingRepository.get(id)).toEqual(pending)
    expect((await adminDb.collection('mfaPending').doc(id).get()).exists).toBe(false)
    expect((await adminDb.collection('mfaPending').doc(mfaPendingDocId(id)).get()).data()?.expireAt).toBeDefined()

    await firestoreMfaPendingRepository.delete(id)
    expect(await firestoreMfaPendingRepository.get(id)).toBeNull()
  })

  it('形の崩れたドキュメントは null', async () => {
    const id = `${RUN_ID}-broken`
    await adminDb.collection('mfaPending').doc(mfaPendingDocId(id)).set({ email: 1 })
    expect(await firestoreMfaPendingRepository.get(id)).toBeNull()
  })
})

describe('firestoreSmsQuotaRepository', () => {
  it('同時に送っても、送れるのは上限の数だけ（トランザクション）', async () => {
    const email = `${RUN_ID}-quota@example.com`
    const decisions = await Promise.all(Array.from({ length: MFA_SMS_DAILY_LIMIT + 5 }, () => firestoreSmsQuotaRepository.consume(email, '2026-11-12')))
    expect(decisions.filter((d) => d.allowed)).toHaveLength(MFA_SMS_DAILY_LIMIT)
    expect(decisions.filter((d) => d.firstRejection)).toHaveLength(1)
    // 生のメールアドレスは置かない。次の日は数え直す
    expect((await adminDb.collection('mfaSmsQuota').doc(smsQuotaDocId(email.toUpperCase())).get()).data()).toMatchObject({ date: '2026-11-12' })
    expect((await firestoreSmsQuotaRepository.consume(email, '2026-11-13')).allowed).toBe(true)
  })
})
