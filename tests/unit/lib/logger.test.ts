import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger } from '@/lib/logger'

function lastLog(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  return JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>
}

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('level・message・extra を1行の JSON にする', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.warn('ログイン失敗', { code: 'auth/x' })
    expect(lastLog(spy)).toMatchObject({ level: 'WARN', message: 'ログイン失敗', code: 'auth/x' })
  })

  // BugHunting.md #20: extra の message が本文（どの API の何のログか）を上書きしていた
  it('extra の message は本文を上書きせず detail に入る', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.error('予約更新 InfraError', { message: 'Firestore unknown error' })
    expect(lastLog(spy)).toMatchObject({ message: '予約更新 InfraError', detail: 'Firestore unknown error' })
  })

  it('extra の level と timestamp も上書きしない', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.error('x', { level: 'INFO', timestamp: 'fake' })
    const log = lastLog(spy)
    expect(log.level).toBe('ERROR')
    expect(log.timestamp).not.toBe('fake')
  })
})
