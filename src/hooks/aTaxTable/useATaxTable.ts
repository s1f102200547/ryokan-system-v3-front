'use client'

import { useState, useEffect } from 'react'
import type { ATaxTableData } from '@/application/aTaxTable/getATaxTableUseCase'

type State = {
  data: ATaxTableData | null
  fetchedKey: string | null // `${year}-${month}` で一致確認
  error: string | null
}

export function useATaxTable(year: number, month: number) {
  const fetchedKey = `${year}-${month}`

  const [state, setState] = useState<State>({
    data: null,
    fetchedKey: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/a-tax-table?year=${year}&month=${month}`)
        if (cancelled) return
        if (!res.ok) {
          const message =
            res.status === 503
              ? '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'
              : 'データの取得に失敗しました。管理者に通知済みです。'
          setState({ data: null, fetchedKey, error: message })
          return
        }
        const data = (await res.json()) as ATaxTableData
        if (!cancelled) setState({ data, fetchedKey, error: null })
      } catch {
        if (!cancelled)
          setState({
            data: null,
            fetchedKey,
            error: '通信エラーが発生しました。ネットワーク接続を確認してください',
          })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = state.fetchedKey !== fetchedKey

  return { data: state.data, isLoading, error: state.error }
}
