// hooks・components のテストで fetchWithSession の代わりに使う。
// 呼ばれたリクエストを順に記録し、応答はテストが好きな順・好きな時に返す（応答の追い越しを再現するため）
//
// 使い方:
//   vi.mock('@/hooks/auth/fetchWithSession', () => ({ fetchWithSession: vi.fn() }))
//   const net = controlledFetch(vi.mocked(fetchWithSession))
//   … 操作 …
//   await net.respond(0, 200, { … })   // 0 番目のリクエストに応答する
import { act } from '@testing-library/react'
import type { Mock } from 'vitest'

export type PendingRequest = {
  url: string
  method: string
  body: unknown
  settled: boolean
  resolve: (status: number, json?: unknown) => Promise<void>
  fail: (error?: Error) => Promise<void>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function controlledFetch(mock: Mock<FetchLike>) {
  const requests: PendingRequest[] = []

  mock.mockImplementation((input: string, init?: RequestInit) => {
    return new Promise<Response>((resolvePromise, rejectPromise) => {
      const req: PendingRequest = {
        url: input,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        settled: false,
        // act の中で応答し、続く setState まで流し切る
        resolve: async (status, json = {}) => {
          if (req.settled) throw new Error(`already settled: ${req.method} ${req.url}`)
          req.settled = true
          await act(async () => {
            resolvePromise(new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } }))
          })
        },
        fail: async (error = new TypeError('Failed to fetch')) => {
          if (req.settled) throw new Error(`already settled: ${req.method} ${req.url}`)
          req.settled = true
          await act(async () => {
            rejectPromise(error)
          })
        },
      }
      requests.push(req)
    })
  })

  return {
    requests,
    // 条件に合うリクエストのうち、まだ応答していないもの
    pending(filter?: (r: PendingRequest) => boolean) {
      return requests.filter((r) => !r.settled && (filter ? filter(r) : true))
    },
    last(filter?: (r: PendingRequest) => boolean) {
      const list = filter ? requests.filter(filter) : requests
      const r = list[list.length - 1]
      if (!r) throw new Error('no request')
      return r
    },
  }
}
