import { describe, it, expect, beforeEach } from 'vitest'
import type { MfaPending } from '@/domain/auth/mfaPending'
import type { MfaPendingRepository } from '@/domain/ports/mfaPendingRepository'
import type { SmsQuotaRepository } from '@/domain/ports/smsQuotaRepository'
import type { LoginThrottleRepository, ThrottleKey } from '@/domain/ports/loginThrottleRepository'
import { LOGIN_PENDING_TTL_MS, MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

// port の契約テスト（docs/MfaBugHunt.md の S9）。同じテストを、メモリの実装（tests/utils/memory*.ts。integration のテストが使う）と
// Firestore の実装（src/infra/auth/firestore*.ts。本番）の両方に流す。
// メモリの実装が本番と違う動きをすると、integration のテストは通るのに本番で壊れる。それを見つけるためのもの

type Setup<R> = { name: string; repo: R; reset: () => Promise<void>; prefix: string }

const NOW = 1_800_000_000_000

export function describeMfaPendingContract({ name, repo, reset, prefix }: Setup<MfaPendingRepository>) {
  describe(`MfaPendingRepository の契約（${name}）`, () => {
    beforeEach(reset)
    const pending = (over: Partial<MfaPending> = {}): MfaPending => ({
      email: `${prefix}@example.com`, ip: '203.0.113.5', mfaPendingCredential: 'cred', sessionInfo: 'session-info', phoneHint: '+81*******1234',
      expiresAtMs: NOW + 300_123, ...over,
    })

    it('保存した値を、そのまま（ミリ秒まで）読み戻す', async () => {
      await repo.save(`${prefix}-a`, pending())
      expect(await repo.get(`${prefix}-a`)).toEqual(pending())
    })

    it('接続元なし（null）・伏せ字の番号なし（空）も読み戻す', async () => {
      await repo.save(`${prefix}-b`, pending({ ip: null, phoneHint: '' }))
      expect(await repo.get(`${prefix}-b`)).toEqual(pending({ ip: null, phoneHint: '' }))
    })

    it('期限を過ぎていても読み戻す（期限の判定は domain が行う）', async () => {
      await repo.save(`${prefix}-c`, pending({ expiresAtMs: 1 }))
      expect((await repo.get(`${prefix}-c`))?.expiresAtMs).toBe(1)
    })

    it('知らない ID は null。消すと null。ないものを消しても投げない', async () => {
      expect(await repo.get(`${prefix}-unknown`)).toBeNull()
      await repo.save(`${prefix}-d`, pending())
      await repo.delete(`${prefix}-d`)
      expect(await repo.get(`${prefix}-d`)).toBeNull()
      await expect(repo.delete(`${prefix}-never`)).resolves.toBeUndefined()
    })

    it('同じ ID に保存し直すと、新しい値になる', async () => {
      await repo.save(`${prefix}-e`, pending())
      await repo.save(`${prefix}-e`, pending({ sessionInfo: 'session-info-2' }))
      expect((await repo.get(`${prefix}-e`))?.sessionInfo).toBe('session-info-2')
    })

    // Cookie の値はブラウザが送るので、どんな文字でもよい（Firestore のドキュメント ID に使えない文字・長さでも）
    it.each([['/ を含む', 'a/b/c'], ['..', '..'], ['空白', ' x '], ['長い（4096 文字）', 'x'.repeat(4096)], ['日本語', '途中']])(
      'Cookie の値が %s でも、保存・読み戻し・削除できる', async (_label, raw) => {
        const id = `${prefix}-${raw}`
        await repo.save(id, pending())
        expect(await repo.get(id)).toEqual(pending())
        await repo.delete(id)
        expect(await repo.get(id)).toBeNull()
      })
  })
}

export function describeSmsQuotaContract({ name, repo, reset, prefix }: Setup<SmsQuotaRepository>) {
  describe(`SmsQuotaRepository の契約（${name}）`, () => {
    beforeEach(reset)

    it(`同時に ${MFA_SMS_DAILY_LIMIT + 5} 通求めても、送れるのは ${MFA_SMS_DAILY_LIMIT} 通。はじめて断ったのは1回`, async () => {
      const email = `${prefix}-a@example.com`
      const decisions = await Promise.all(Array.from({ length: MFA_SMS_DAILY_LIMIT + 5 }, () => repo.consume(email, '2026-11-16')))
      expect(decisions.filter((d) => d.allowed)).toHaveLength(MFA_SMS_DAILY_LIMIT)
      expect(decisions.filter((d) => d.firstRejection)).toHaveLength(1)
    })

    it('メールアドレスの大文字・前後の空白は同じアカウントとして数える', async () => {
      await repo.consume(`${prefix}-b@example.com`, '2026-11-16')
      const d = await repo.consume(`  ${prefix.toUpperCase()}-B@EXAMPLE.COM `, '2026-11-16')
      expect(d.next.count).toBe(2)
    })

    it('次の日は1から。前の日に戻しても、前の日の数は残っていない（上書き）', async () => {
      const email = `${prefix}-c@example.com`
      for (let i = 0; i < 3; i++) await repo.consume(email, '2026-11-16')
      expect((await repo.consume(email, '2026-11-17')).next.count).toBe(1)
      expect((await repo.consume(email, '2026-11-16')).next.count).toBe(1)
    })

    it('別のアカウントは別に数える', async () => {
      await repo.consume(`${prefix}-d@example.com`, '2026-11-16')
      expect((await repo.consume(`${prefix}-e@example.com`, '2026-11-16')).next.count).toBe(1)
    })
  })
}

export function describeLoginThrottleContract({ name, repo, reset, prefix }: Setup<LoginThrottleRepository>) {
  describe(`LoginThrottleRepository の契約（${name}）`, () => {
    beforeEach(reset)
    const keys = (s: string): ThrottleKey[] => [{ kind: 'email', value: `${prefix}-${s}@example.com` }, { kind: 'ip', value: `ip-${prefix}-${s}` }]

    it('記録がなければ null', async () => {
      expect(await repo.read(keys('a'))).toEqual([null, null])
    })

    it('失敗0回のとき、同時に4回札を求めても、出るのは3枚（残りは busy）', async () => {
      const k = keys('b')
      const results = await Promise.all(Array.from({ length: 4 }, (_, i) => repo.acquire(k, NOW, `t${i}`)))
      expect(results.filter((r) => r.success)).toHaveLength(3)
      expect(results.filter((r) => !r.success && r.error.kind === 'busy')).toHaveLength(1)
    })

    it('failure を3回確定すると、両方の key を止め、止め始めた時間を返す。止まっている間は locked', async () => {
      const k = keys('c')
      let last: { lockMs: number | null; failures: number }[] = []
      for (let i = 0; i < 3; i++) {
        expect((await repo.acquire(k, NOW + i, `t${i}`)).success).toBe(true)
        last = await repo.complete(k, `t${i}`, 'failure', NOW + i)
      }
      expect(last).toEqual([{ lockMs: 60_000, failures: 3 }, { lockMs: 60_000, failures: 3 }])
      expect(await repo.acquire(k, NOW + 10, 'next')).toEqual({ success: false, error: { kind: 'locked', retryAfterMs: 60_000 - 8 } })
      expect((await repo.read(k)).map((s) => s?.failures)).toEqual([3, 3])
    })

    it('success は記録を消す（read が null）。void は回数を変えない', async () => {
      const k = keys('d')
      await repo.acquire(k, NOW, 't1')
      await repo.complete(k, 't1', 'failure', NOW)
      await repo.acquire(k, NOW + 1, 't2')
      expect(await repo.complete(k, 't2', 'void', NOW + 1)).toEqual([{ lockMs: null, failures: 1 }, { lockMs: null, failures: 1 }])
      await repo.acquire(k, NOW + 2, 't3')
      await repo.complete(k, 't3', 'success', NOW + 2)
      expect(await repo.read(k)).toEqual([null, null])
    })

    // 片方の key だけ札が埋まっているとき（同じ IP のほかのアカウントが試行中）。断るなら、どちらの key にも書かない
    it('片方の key だけ埋まっていれば busy。もう片方には札を書かない', async () => {
      const shared: ThrottleKey = { kind: 'ip', value: `ip-${prefix}-shared` }
      const a: ThrottleKey = { kind: 'email', value: `${prefix}-ea@example.com` }
      const b: ThrottleKey = { kind: 'email', value: `${prefix}-eb@example.com` }
      for (let i = 0; i < 3; i++) expect((await repo.acquire([a, shared], NOW, `a${i}`)).success).toBe(true)
      expect(await repo.acquire([b, shared], NOW, 'b0')).toEqual({ success: false, error: { kind: 'busy', retryAfterMs: 1000 } })
      expect(await repo.read([b])).toEqual([null])
    })

    it('外し忘れた札は、期限が過ぎれば数えない', async () => {
      const k = keys('e')
      for (let i = 0; i < 3; i++) await repo.acquire(k, NOW, `t${i}`)
      expect((await repo.acquire(k, NOW + LOGIN_PENDING_TTL_MS - 1, 'late')).success).toBe(false)
      expect((await repo.acquire(k, NOW + LOGIN_PENDING_TTL_MS, 'late')).success).toBe(true)
    })

    it('メールアドレスの大文字・前後の空白は同じ key。IP はそのまま（大文字は別）', async () => {
      await repo.acquire([{ kind: 'email', value: `${prefix}-f@example.com` }], NOW, 't1')
      await repo.complete([{ kind: 'email', value: `${prefix}-f@example.com` }], 't1', 'failure', NOW)
      expect((await repo.read([{ kind: 'email', value: ` ${prefix.toUpperCase()}-F@EXAMPLE.COM ` }]))[0]?.failures).toBe(1)
      await repo.acquire([{ kind: 'ip', value: 'IPV6::A' }], NOW, 't2')
      await repo.complete([{ kind: 'ip', value: 'IPV6::A' }], 't2', 'failure', NOW)
      expect(await repo.read([{ kind: 'ip', value: 'ipv6::a' }])).toEqual([null])
    })
  })
}
