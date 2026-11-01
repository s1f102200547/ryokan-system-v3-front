// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { setNowJST } from '@tests/utils/timeHelper'

// 本番のみの時間帯制限（6:00〜23:00 JST）
describe('時間帯制限（production）', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([
    ['00:00', true], ['05:59', true], ['06:00', false], ['08:59', false], ['09:00', false],
    ['22:59', false], ['23:00', true], ['23:59', true],
  ] as const)('JST %s → 時間外 %s', (time, outside) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.useFakeTimers()
    setNowJST(`2026-05-20T${time}`)
    const res = proxy(new NextRequest('http://localhost/daily-dashboard', { headers: { cookie: 'session=x' } }))
    const location = res.headers.get('location') ?? ''
    expect(location.endsWith('/time-restricted')).toBe(outside)
  })
})
