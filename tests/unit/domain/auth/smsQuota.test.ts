import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { consumeSms, type SmsQuotaState } from '@/domain/auth/smsQuota'
import { MFA_SMS_DAILY_LIMIT } from '@/constants/auth'

const TODAY = '2026-11-12'

describe('consumeSms', () => {
  it('はじめての1通は送れる', () => {
    expect(consumeSms(null, TODAY)).toEqual({ allowed: true, firstRejection: false, next: { date: TODAY, count: 1 } })
  })

  it('上限まで送れて、その次で断る。断ったことを知らせるのは1回だけ', () => {
    let state: SmsQuotaState | null = null
    const decisions = Array.from({ length: MFA_SMS_DAILY_LIMIT + 3 }, () => {
      const d = consumeSms(state, TODAY)
      state = d.next
      return d
    })
    expect(decisions.filter((d) => d.allowed)).toHaveLength(MFA_SMS_DAILY_LIMIT)
    expect(decisions[MFA_SMS_DAILY_LIMIT]).toMatchObject({ allowed: false, firstRejection: true })
    expect(decisions.slice(MFA_SMS_DAILY_LIMIT + 1).every((d) => !d.allowed && !d.firstRejection)).toBe(true)
    expect(state).toEqual({ date: TODAY, count: MFA_SMS_DAILY_LIMIT + 1 }) // 断り続けても増え続けない
  })

  it('前の日の数は数えない', () => {
    expect(consumeSms({ date: '2026-11-11', count: 99 }, TODAY)).toEqual({ allowed: true, firstRejection: false, next: { date: TODAY, count: 1 } })
  })

  it('どんな状態からでも、送れるのは今日の数が上限より少ないときだけ', () => {
    fc.assert(fc.property(fc.integer({ min: -5, max: 50 }), fc.boolean(), (count, sameDay) => {
      const d = consumeSms({ date: sameDay ? TODAY : '2026-01-01', count }, TODAY)
      const todayCount = sameDay ? Math.max(0, count) : 0
      expect(d.allowed).toBe(todayCount < MFA_SMS_DAILY_LIMIT)
      expect(d.next.date).toBe(TODAY)
      expect(d.next.count).toBeLessThanOrEqual(MFA_SMS_DAILY_LIMIT + 1)
    }))
  })
})
