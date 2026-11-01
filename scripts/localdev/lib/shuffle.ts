import type { Rng } from './rng'

// Fisher–Yates。値の多重集合（null や '' を含む）を保ったまま並べ替える
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
