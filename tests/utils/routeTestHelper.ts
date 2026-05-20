import { vi, beforeAll, afterAll } from 'vitest'

// getTodayJST() が new Date() を使うため、テスト全体で日付を固定する
export const FIXED_TODAY = '2026-05-20'
// UTC 01:00 = JST 10:00 → getTodayJST() が FIXED_TODAY を返す
const FIXED_NOW_UTC = new Date('2026-05-20T01:00:00.000Z')

export function setupFakeToday(): void {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW_UTC)
  })
  afterAll(() => {
    vi.useRealTimers()
  })
}
