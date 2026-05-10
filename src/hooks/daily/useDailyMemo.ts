'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { debounce } from '@/lib/debounce'

type State = {
  memo: string
  fetchedDate: string | null
  error: string | null
}

export function useDailyMemo(date: string) {
  const [state, setState] = useState<State>({ memo: '', fetchedDate: null, error: null })
  const [isSaving, setIsSaving] = useState(false)

  const debouncedSaveRef = useRef(
    debounce(async (targetDate: string, memo: string) => {
      setIsSaving(true)
      try {
        await fetch(`/api/daily/${targetDate}/daily-memo`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memo }),
        })
      } finally {
        setIsSaving(false)
      }
    }, 1000),
  )

  useEffect(() => {
    debouncedSaveRef.current.cancel()
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/daily/${date}/daily-memo`)
        if (cancelled) return
        if (!res.ok) {
          setState({ memo: '', fetchedDate: date, error: 'データの取得に失敗しました' })
          return
        }
        const json = (await res.json()) as { memo: string }
        if (!cancelled) setState({ memo: json.memo, fetchedDate: date, error: null })
      } catch {
        if (!cancelled) setState({ memo: '', fetchedDate: date, error: '通信エラーが発生しました' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [date])

  const updateMemo = useCallback(
    (memo: string) => {
      setState((prev) => ({ ...prev, memo }))
      debouncedSaveRef.current(date, memo)
    },
    [date],
  )

  const isLoading = state.fetchedDate !== date

  return { memo: state.memo, isLoading, error: state.error, isSaving, updateMemo }
}
