'use client'

import { useState, useEffect, useCallback } from 'react'

type State = {
  staffName: string
  fetchedDate: string | null
  error: string | null
}

export function useSafeBalanceChecker(date: string) {
  const [state, setState] = useState<State>({ staffName: '', fetchedDate: null, error: null })
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/daily/${date}/safe-balance-checker`)
        if (cancelled) return
        if (!res.ok) {
          setState({ staffName: '', fetchedDate: date, error: 'データの取得に失敗しました' })
          return
        }
        const json = (await res.json()) as { staffName: string }
        if (!cancelled) setState({ staffName: json.staffName, fetchedDate: date, error: null })
      } catch {
        if (!cancelled) setState({ staffName: '', fetchedDate: date, error: '通信エラーが発生しました' })
      }
    }

    void load()
    return () => { cancelled = true }
  }, [date])

  const update = useCallback(async (staffName: string): Promise<void> => {
    setIsPending(true)
    try {
      const res = await fetch(`/api/daily/${date}/safe-balance-checker`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName }),
      })
      if (res.ok) setState((prev) => ({ ...prev, staffName }))
    } finally {
      setIsPending(false)
    }
  }, [date])

  const isLoading = state.fetchedDate !== date

  return { staffName: state.staffName, isLoading, error: state.error, isPending, update }
}
