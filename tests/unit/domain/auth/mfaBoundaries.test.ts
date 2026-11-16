import { describe, it, expect } from 'vitest'
import { acquireAttempt, checkThrottle, recordFailure, remainingBeforeLock, type ThrottleState } from '@/domain/auth/loginThrottle'
import { consumeSms } from '@/domain/auth/smsQuota'
import { sanitizeMfaCodeInput } from '@/lib/auth/mfaCodeInput'
import { parseRecaptchaSiteKey } from '@/lib/auth/recaptchaSiteKey'
import { LoginBodySchema, MfaVerifyBodySchema } from '@/lib/api/loginSchema'
import { LOGIN_FAILURE_RESET_MS, LOGIN_PENDING_TTL_MS, MFA_SMS_DAILY_LIMIT, RECAPTCHA_TOKEN_MAX_LENGTH } from '@/constants/auth'

// SMS の2要素目まわりの境界値（docs/MfaBugHunt.md の S5）。既存のテストにない境目だけ。
// 失敗の回数の段（lockDurationMs）、途中の状態の期限ちょうど、メールアドレス・パスワードの長さは既存のテストにある

const NOW = 1_800_000_000_000
const state = (s: Partial<ThrottleState>): ThrottleState => ({ failures: 0, lastFailureAtMs: NOW, lockedUntilMs: 0, pending: [], ...s })

describe('失敗の回数の境目', () => {
  it.each([[0, 3], [1, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]])(
    '失敗 %i 回のとき、同時に出せる札は %i 枚（次に止める段まで）', (failures, tickets) => {
      expect(remainingBeforeLock(failures)).toBe(tickets)
    })

  it('止める時刻ちょうどで通す。1ms 前は残り 1ms', () => {
    const locked = state({ failures: 3, lockedUntilMs: NOW + 60_000 })
    expect(checkThrottle(locked, NOW + 60_000).success).toBe(true)
    expect(checkThrottle(locked, NOW + 59_999)).toEqual({ success: false, error: { retryAfterMs: 1 } })
  })

  it('最後の失敗からちょうど24時間で、1から数え直す（1ms 前は数え続ける）', () => {
    const s = state({ failures: 2 })
    expect(recordFailure(s, NOW + LOGIN_FAILURE_RESET_MS).next.failures).toBe(1)
    expect(recordFailure(s, NOW + LOGIN_FAILURE_RESET_MS - 1).next.failures).toBe(3)
  })

  it('外し忘れた札は、期限ちょうどで消える（1ms 前は残っている）', () => {
    // 失敗2回: 札は1枚まで。ほかの試行の札が1枚ある
    const s = state({ failures: 2, pending: [{ id: 'other', expiresAtMs: NOW + LOGIN_PENDING_TTL_MS }] })
    expect(acquireAttempt(s, NOW + LOGIN_PENDING_TTL_MS - 1, 'me')).toMatchObject({ success: false, error: { kind: 'busy' } })
    expect(acquireAttempt(s, NOW + LOGIN_PENDING_TTL_MS, 'me').success).toBe(true)
  })
})

describe('1日の SMS の通数の境目', () => {
  it.each([
    [MFA_SMS_DAILY_LIMIT - 1, true, false, MFA_SMS_DAILY_LIMIT],
    [MFA_SMS_DAILY_LIMIT, false, true, MFA_SMS_DAILY_LIMIT + 1],
    [MFA_SMS_DAILY_LIMIT + 1, false, false, MFA_SMS_DAILY_LIMIT + 1],
    [-1, true, false, 1], // 壊れた値は 0 として扱う
  ])('今日すでに %i 通 → 送れる: %s / はじめて断った: %s / 次の数: %i', (count, allowed, firstRejection, next) => {
    expect(consumeSms({ date: '2026-11-16', count }, '2026-11-16')).toEqual({ allowed, firstRejection, next: { date: '2026-11-16', count: next } })
  })
})

describe('ログイン API の body の境目', () => {
  const base = { email: 'pc1@example.com', password: 'abc' }
  it.each([
    ['0文字', '', false],
    ['1文字', 't', true],
    [`${RECAPTCHA_TOKEN_MAX_LENGTH}文字`, 't'.repeat(RECAPTCHA_TOKEN_MAX_LENGTH), true],
    [`${RECAPTCHA_TOKEN_MAX_LENGTH + 1}文字`, 't'.repeat(RECAPTCHA_TOKEN_MAX_LENGTH + 1), false],
  ])('recaptchaToken が %s → 通す: %s', (_label, recaptchaToken, ok) => {
    expect(LoginBodySchema.safeParse({ ...base, recaptchaToken }).success).toBe(ok)
  })

  it.each([
    ['000000', true], ['999999', true],
    ['123456\n', false], // 末尾の改行（正規表現の $ が改行の前で合わないこと）
    ['123456', true], // ただの 6
    ['１２３４５６', false], // 全角はサーバーでは通さない（画面が半角に直す）
    ['¹²³⁴⁵⁶', false],
  ])('コード %j → 通す: %s', (code, ok) => {
    expect(MfaVerifyBodySchema.safeParse({ code }).success).toBe(ok)
  })
})

describe('reCAPTCHA のサイトキーの長さ・文字の境目', () => {
  it.each([
    ['19文字', 'a'.repeat(19), false],
    ['20文字', 'a'.repeat(20), true],
    ['100文字', 'a'.repeat(100), true],
    ['101文字', 'a'.repeat(101), false],
    ['- と _ を含む', `${'a'.repeat(18)}-_`, true],
    ['. を含む', `${'a'.repeat(19)}.`, false],
  ])('%s → 使う: %s', (_label, key, ok) => {
    expect(parseRecaptchaSiteKey(key)).toBe(ok ? key : null)
  })
})

describe('コードの入力欄の直し方の境目', () => {
  it.each([
    ['5桁', '12345', '12345', false],
    ['7桁の貼り付け（7桁目は黙って捨てる）', '1234567', '123456', false],
    ['タブ区切り', '123\t456', '123456', false],
    ['改行なしの空白（NBSP）', '123 456', '123456', false],
    ['マイナス記号（U+2212）', '123−456', '123456', false],
    ['上付きの数字（NFKC で半角になる）', '¹²³⁴⁵⁶', '123456', false],
    ['丸数字（NFKC で半角になる）', '①②③④⑤⑥', '123456', false],
    ['アラビア・インドの数字（半角にならない）', '١٢٣٤٥٦', '', true],
  ])('%s: %j → %j（理由: %s）', (_label, raw, digits, rejected) => {
    expect(sanitizeMfaCodeInput(raw)).toEqual({ digits, rejected })
  })
})
