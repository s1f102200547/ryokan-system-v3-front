import { maskString } from './mask'
import type { Rng } from './rng'

// ID の振り直し（docs/LocalDevelopment.md §4.3 ID の振り直し）
// 同じ実行内では、同じ元の値に同じ新しい値を対応させる（コレクションをまたいだ参照関係を保つ）。
// 対応表は1つだけ持ち、ドキュメント ID・reservation_number・mail_id・todos[].id で共有する。
// 新しい値: 元が UUID なら UUID v4、それ以外は元と同じ長さ・同じ文字の種類の乱数（Q-4）

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = '0123456789abcdef'

export type IdRemapper = {
  remap(original: string): string
}

export function createIdRemapper(rng: Rng): IdRemapper {
  const mapping = new Map<string, string>()
  const used = new Set<string>()

  const generate = (original: string): string => {
    if (UUID_PATTERN.test(original)) return randomUuidV4(rng)
    return maskString(original, rng)
  }

  return {
    remap(original) {
      if (original === '') return original
      const existing = mapping.get(original)
      if (existing !== undefined) return existing
      // 衝突・元の値との一致を避ける。短い ID で候補が尽きる場合に備えて上限を置く
      for (let attempt = 0; attempt < 1000; attempt++) {
        const candidate = generate(original)
        if (candidate !== original && !used.has(candidate)) {
          mapping.set(original, candidate)
          used.add(candidate)
          return candidate
        }
      }
      throw new Error('ID の振り直しで衝突しない値を作れませんでした（ID が短すぎる可能性）')
    },
  }
}

function randomUuidV4(rng: Rng): string {
  const hex = Array.from({ length: 32 }, () => HEX[rng.int(16)])
  hex[12] = '4'
  hex[16] = HEX[8 + rng.int(4)] // variant 10xx
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
