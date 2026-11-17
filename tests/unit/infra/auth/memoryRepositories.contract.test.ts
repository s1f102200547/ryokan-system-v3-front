// @vitest-environment node
import { createMemoryMfaPendingRepository, createMemorySmsQuotaRepository } from '@tests/utils/memoryMfaRepositories'
import { createMemoryLoginThrottleRepository } from '@tests/utils/memoryLoginThrottleRepository'
import { describeLoginThrottleContract, describeMfaPendingContract, describeSmsQuotaContract } from '@tests/utils/contracts/mfaRepositories.contract'

// メモリの実装（integration のテストが Firestore の代わりに使う）が、port の契約を守ること（docs/MfaBugHunt.md の S9）。
// 同じ契約を Firestore の実装にも流す（tests/emulator/mfaContracts.test.ts）
const pending = createMemoryMfaPendingRepository()
const quota = createMemorySmsQuotaRepository()
const throttle = createMemoryLoginThrottleRepository()

describeMfaPendingContract({ name: 'メモリ', repo: pending, reset: async () => pending.clear(), prefix: 'mem' })
describeSmsQuotaContract({ name: 'メモリ', repo: quota, reset: async () => quota.clear(), prefix: 'mem' })
describeLoginThrottleContract({ name: 'メモリ', repo: throttle, reset: async () => throttle.clear(), prefix: 'mem' })
