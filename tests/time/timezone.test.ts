import { describe, it, expect } from 'vitest'

// npm run test:tz は TZ を変えて tests/time/ を3回実行する。TZ の指定が本当に効いていることを確かめる
describe('実行環境の TZ', () => {
  it.runIf(process.env.TZ)('TZ 環境変数のとおりになっている', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(process.env.TZ)
  })
})
