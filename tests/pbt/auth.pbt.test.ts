import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { describeError } from '@/infra/auth/identityToolkit'
import { sanitizeMfaCodeInput } from '@/lib/auth/mfaCodeInput'
import { buildLoginLockNotice, buildLoginNotice, buildLoginRejectedNotice, buildSmsLimitNotice, forwardedIps } from '@/lib/auth/loginNotice'
import { parseCookieValue } from '@/lib/api/routeHelpers'
import { MfaVerifyBodySchema } from '@/lib/api/loginSchema'
import { MFA_CODE_LENGTH } from '@/constants/auth'

// SMS の2要素目まわりの純粋関数の性質（docs/MfaBugHunt.md の S10）。性質は仕様（コメント・docs）から立てる

// ヘッダーに入りうる文字（Latin-1。Request は 0xFF より上を受け付けない）と、Google のエラーの文に入りうる文字
const latin1 = fc.array(fc.integer({ min: 0x20, max: 0xff }), { maxLength: 80 }).map((cs) => String.fromCharCode(...cs))
// 数字・英数字・区切りが多く出る文字列（電話番号・コード・token に近いもの）
const denseText = fc.array(fc.constantFrom(...'0123456789abcXYZ_-. +:'.split('')), { maxLength: 120 }).map((a) => a.join(''))
const anyText = fc.oneof(fc.string({ maxLength: 120 }), fc.string({ unit: 'binary', maxLength: 120 }), latin1, denseText)

describe('describeError（ログ・Slack に載せる Google の説明の文）', () => {
  // 仕様: 「6桁以上の数字の並び（電話番号・SMS のコード）と 32文字以上の英数字の並び（token・キー）を伏せ、200文字で切る」
  it('出力に、6桁以上つづく半角数字と、32文字以上つづく英数字（_ - . を含む）が残らない。200文字以下', () => {
    fc.assert(fc.property(fc.string({ maxLength: 40 }), anyText, (code, rest) => {
      const out = describeError(`${code.replace(/[\s:]/g, '')} : ${rest}`)
      expect(out).not.toMatch(/\d{6,}/)
      expect(out).not.toMatch(/[A-Za-z0-9_\-.]{32,}/)
      expect(out.length).toBeLessThanOrEqual(200)
    }), { numRuns: 2000 })
  })

  it('空白・ハイフンで区切った電話番号（+81 90-1234-5678 の形）も伏せる', () => {
    const phone = fc.tuple(fc.constantFrom('+81 ', '0', '+1 '), fc.array(fc.stringMatching(/^\d{2,4}$/), { minLength: 3, maxLength: 4 }), fc.constantFrom(' ', '-'))
      .map(([head, parts, sep]) => head + parts.join(sep))
    fc.assert(fc.property(phone, (p) => {
      const out = describeError(`INVALID_PHONE_NUMBER : bad number ${p} here`)
      expect(out.replace(/\D/g, '').length).toBeLessThan(6)
    }))
  })

  // 仕様の言葉（電話番号・SMS のコードを伏せる）からは、区切りが「.」「()」でも、全角の数字でも伏せたい
  it.fails('[F-16] 「.」「()」で区切った電話番号・全角の数字の電話番号も伏せる', () => {
    for (const p of ['090.1234.5678', '(090)1234-5678', '０９０１２３４５６７８', '090 1234 5678']) {
      const out = describeError(`INVALID_PHONE_NUMBER : ${p}`)
      expect(out.normalize('NFKC').replace(/\D/g, '').length).toBeLessThan(6)
    }
  })
})

describe('sanitizeMfaCodeInput（コードの入力欄）', () => {
  it('出力はいつも半角数字で、6桁以下', () => {
    fc.assert(fc.property(anyText, (raw) => {
      expect(sanitizeMfaCodeInput(raw).digits).toMatch(new RegExp(`^[0-9]{0,${MFA_CODE_LENGTH}}$`))
    }), { numRuns: 2000 })
  })

  it('直した結果をもう一度直しても変わらず、理由も出さない（冪等）', () => {
    fc.assert(fc.property(anyText, (raw) => {
      const once = sanitizeMfaCodeInput(raw).digits
      expect(sanitizeMfaCodeInput(once)).toEqual({ digits: once, rejected: false })
    }))
  })

  it('6桁にそろえば、verify API の Zod を必ず通る', () => {
    fc.assert(fc.property(anyText, (raw) => {
      const { digits } = sanitizeMfaCodeInput(raw)
      if (digits.length === MFA_CODE_LENGTH) expect(MfaVerifyBodySchema.safeParse({ code: digits }).success).toBe(true)
    }))
  })

  it('半角・全角の数字と区切りだけの入力なら、理由を出さない', () => {
    const allowed = fc.constantFrom(...'0123456789０１２３４５６７８９ 　-‐－ー'.split(''))
    fc.assert(fc.property(fc.array(allowed, { maxLength: 20 }).map((a) => a.join('')), (raw) => {
      expect(sanitizeMfaCodeInput(raw).rejected).toBe(false)
    }))
  })
})

describe('forwardedIps（X-Forwarded-For）', () => {
  it('右端から最大4件。どれも IP の形か「?」で、Slack の書式の文字（< > & * _ ` 改行）を含まない', () => {
    fc.assert(fc.property(fc.oneof(latin1, fc.array(latin1, { maxLength: 8 }).map((a) => a.join(','))), (header) => {
      const ips = forwardedIps(header)
      expect(ips.length).toBeLessThanOrEqual(4)
      for (const ip of ips) {
        expect(ip === '?' || /^[0-9a-fA-F:.]+$/.test(ip)).toBe(true)
        expect(ip).not.toMatch(/[<>&*_`\n]/)
      }
    }), { numRuns: 1000 })
  })

  it('右端の値は、ヘッダーの右端（Google が書いた値）から決まり、左側をどう書いても変わらない', () => {
    const ip = fc.ipV4()
    fc.assert(fc.property(fc.array(latin1, { maxLength: 5 }), ip, (left, right) => {
      expect(forwardedIps([...left, right].join(',')).at(-1)).toBe(right)
    }))
  })
})

describe('Slack の通知の文', () => {
  // メールアドレス・detail は利用者の書いた値が入りうる。User-Agent・X-Forwarded-For は利用者が自由に書ける
  const input = fc.record({
    account: latin1, forwardedFor: fc.option(latin1, { nil: null }), userAgent: fc.option(latin1, { nil: null }),
    nowMs: fc.integer({ min: 0, max: 4_102_444_800_000 }), detail: fc.option(latin1, { nil: undefined }),
  })
  // Slack の書式で意味を持つ < > が、エスケープ（&lt; &gt;）以外で残らない。1行に収まる
  const safe = (message: string) => {
    expect(message).not.toMatch(/[<>]/)
    expect(message).not.toMatch(/[\r\n]/)
  }

  it('[ログイン]・[ログイン拒否]・[SMS 上限]・[ログイン制限] のどれも、書式の文字を含まず1行', () => {
    fc.assert(fc.property(input, fc.boolean(), (i, emailKey) => {
      safe(buildLoginNotice(i))
      safe(buildLoginRejectedNotice({ ...i, reason: 'ip_mismatch' }))
      safe(buildSmsLimitNotice({ ...i, limit: 10 }))
      safe(buildLoginLockNotice({ key: { kind: emailKey ? 'email' : 'ip', value: i.account }, failures: 3, lockMs: 60_000 }))
    }), { numRuns: 1000 })
  })

  it('生の User-Agent は載せない（「Chrome on Windows」の形だけ）', () => {
    fc.assert(fc.property(input, (i) => {
      const message = buildLoginNotice({ ...i, account: 'pc1@example.com', forwardedFor: null })
      expect(message).toMatch(/ \/ (Chrome|Edge|その他のブラウザ) on [^/]+ \/ \d\d\/\d\d \d\d:\d\d$/)
    }))
  })
})

describe('parseCookieValue（mfa_pending の Cookie）', () => {
  const name = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/)
  const value = fc.stringMatching(/^[A-Za-z0-9_\-=.]{0,50}$/)
  it('ほかの Cookie がどの順に並んでいても、mfa_pending の値だけを取り出す（似た名前に取り違えない）', () => {
    fc.assert(fc.property(fc.array(fc.tuple(name, value), { maxLength: 6 }), value, fc.nat(), (others, mine, pos) => {
      const filtered = others.filter(([n]) => n !== 'mfa_pending')
      const pairs = [...filtered.map(([n, v]) => `${n}=${v}`)]
      pairs.splice(pos % (pairs.length + 1), 0, `mfa_pending=${mine}`)
      expect(parseCookieValue(pairs.join('; '), 'mfa_pending')).toBe(mine)
      expect(parseCookieValue(`x${'mfa_pending'}=evil; ${pairs.join('; ')}`, 'mfa_pending')).toBe(mine)
    }))
  })
})
