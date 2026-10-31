import { randomInt } from 'node:crypto'

// 乱数は引数で注入する（テストでは seededRng で再現できるようにする）
export type Rng = {
  // 0 以上 maxExclusive 未満の整数
  int(maxExclusive: number): number
}

// 本番の匿名化で使う。暗号論的乱数なので、出力から元の値を推定できない
export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
}

// テスト用の再現できる乱数（mulberry32）。匿名化の実行では使わない
export function seededRng(seed: number): Rng {
  let state = seed >>> 0
  return {
    int(maxExclusive) {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
      return Math.floor(r * maxExclusive)
    },
  }
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.int(items.length)]
}
