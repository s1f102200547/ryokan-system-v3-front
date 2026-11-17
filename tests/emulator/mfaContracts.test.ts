// @vitest-environment node
// Firestore の実装が、port の契約を守ること（docs/MfaBugHunt.md の S9）。メモリの実装にも同じ契約を流す
// （tests/unit/infra/auth/memoryRepositories.contract.test.ts）。
// あわせて、Firestore の実装だけが持つこと（形の崩れたドキュメント、TTL の expireAt、ハッシュの ID）を確かめる
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { firestoreMfaPendingRepository, mfaPendingDocId } from '@/infra/auth/firestoreMfaPendingRepository'
import { firestoreSmsQuotaRepository, smsQuotaDocId } from '@/infra/auth/firestoreSmsQuotaRepository'
import { firestoreLoginThrottleRepository, throttleDocId } from '@/infra/auth/firestoreLoginThrottleRepository'
import { describeLoginThrottleContract, describeMfaPendingContract, describeSmsQuotaContract } from '@tests/utils/contracts/mfaRepositories.contract'
import { LOGIN_FAILURE_RESET_MS } from '@/constants/auth'

const RUN_ID = `emutest-contract-${Date.now()}`
const COLLECTIONS = ['mfaPending', 'mfaSmsQuota', 'loginThrottle'] as const
const clear = async () => {
  for (const c of COLLECTIONS) await adminDb.recursiveDelete(adminDb.collection(c))
}

beforeAll(() => {
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^127\.0\.0\.1:/)
})
afterAll(clear)

describeMfaPendingContract({ name: 'Firestore', repo: firestoreMfaPendingRepository, reset: clear, prefix: RUN_ID })
describeSmsQuotaContract({ name: 'Firestore', repo: firestoreSmsQuotaRepository, reset: clear, prefix: RUN_ID })
describeLoginThrottleContract({ name: 'Firestore', repo: firestoreLoginThrottleRepository, reset: clear, prefix: RUN_ID })

describe('Firestore の実装だけが持つこと', () => {
  const HOUR = 60 * 60 * 1000

  it('SMS の通数: 形の崩れたドキュメントは、なかったものとして1から数え、正しい形に書き直す', async () => {
    const email = `${RUN_ID}-broken@example.com`
    const ref = adminDb.collection('mfaSmsQuota').doc(smsQuotaDocId(email))
    await ref.set({ date: '2026/11/16', count: 'many' })
    expect((await firestoreSmsQuotaRepository.consume(email, '2026-11-16')).next.count).toBe(1)
    expect((await ref.get()).data()).toMatchObject({ date: '2026-11-16', count: 1 })
  })

  it('SMS の通数: expireAt は書いた時刻のおよそ2日後（TTL ポリシーで消える）', async () => {
    const email = `${RUN_ID}-ttl@example.com`
    const before = Date.now()
    await firestoreSmsQuotaRepository.consume(email, '2026-11-16')
    const expireAt = ((await adminDb.collection('mfaSmsQuota').doc(smsQuotaDocId(email)).get()).data()?.expireAt as Timestamp).toMillis()
    expect(expireAt).toBeGreaterThanOrEqual(before + 48 * HOUR)
    expect(expireAt).toBeLessThanOrEqual(Date.now() + 48 * HOUR)
  })

  it('途中の状態: expireAt は期限そのもの（TTL ポリシーで消える）。中にメールアドレス以外の個人の情報はない', async () => {
    const id = `${RUN_ID}-ttl`
    await firestoreMfaPendingRepository.save(id, {
      email: `${RUN_ID}@example.com`, ip: '203.0.113.5', mfaPendingCredential: 'cred', sessionInfo: 'si', phoneHint: '+81*******1234', expiresAtMs: 1_800_000_000_123,
    })
    const data = (await adminDb.collection('mfaPending').doc(mfaPendingDocId(id)).get()).data()
    expect((data?.expireAt as Timestamp).toMillis()).toBe(1_800_000_000_123)
    expect(Object.keys(data ?? {}).sort()).toEqual(['email', 'expireAt', 'ip', 'mfaPendingCredential', 'phoneHint', 'sessionInfo'])
  })

  it.each([
    ['必須の値がない', { email: 'x@example.com', ip: null }],
    ['expireAt が Timestamp でない', { email: 'x@example.com', ip: null, mfaPendingCredential: 'c', sessionInfo: 's', phoneHint: '', expireAt: 1_800_000_000_000 }],
    ['sessionInfo が空', { email: 'x@example.com', ip: null, mfaPendingCredential: 'c', sessionInfo: '', phoneHint: '', expireAt: Timestamp.fromMillis(1_800_000_000_000) }],
  ])('途中の状態: 形の崩れたドキュメント（%s）は null', async (_label, data) => {
    const id = `${RUN_ID}-broken-${_label}`
    await adminDb.collection('mfaPending').doc(mfaPendingDocId(id)).set(data)
    expect(await firestoreMfaPendingRepository.get(id)).toBeNull()
  })

  it('失敗の回数: expireAt は最後の失敗から 25時間後（数え直す24時間 + いちばん長く止める1時間）。ID に生の値を使わない', async () => {
    const key = { kind: 'email' as const, value: `${RUN_ID}-ttl@example.com` }
    const now = Date.now()
    await firestoreLoginThrottleRepository.acquire([key], now, 't1')
    await firestoreLoginThrottleRepository.complete([key], 't1', 'failure', now)
    const snap = await adminDb.collection('loginThrottle').doc(throttleDocId(key)).get()
    expect((snap.data()?.expireAt as Timestamp).toMillis()).toBe(now + LOGIN_FAILURE_RESET_MS + HOUR)
    expect(snap.id).not.toContain('@')
  })
})
