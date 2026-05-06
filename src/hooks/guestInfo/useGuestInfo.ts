'use client'

import { useState, useEffect } from 'react'
import type { GuestInfoData } from '@/application/guestInfo/getGuestInfoUseCase'

type State = {
  data: GuestInfoData | null
  fetchedDate: string | null
  error: string | null
}

export function useGuestInfo(targetDate: string) {
  const [state, setState] = useState<State>({
    data: null,
    fetchedDate: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/guest-info?date=${targetDate}`)
        if (cancelled) return
        if (!res.ok) {
          const message =
            res.status === 503
              ? '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'
              : 'データの取得に失敗しました。管理者に通知済みです。'
          setState({ data: null, fetchedDate: targetDate, error: message })
          return
        }
        const data = (await res.json()) as GuestInfoData
        if (!cancelled) setState({ data, fetchedDate: targetDate, error: null })
      } catch {
        if (!cancelled)
          setState({
            data: null,
            fetchedDate: targetDate,
            error: '通信エラーが発生しました。ネットワーク接続を確認してください',
          })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [targetDate])

  const isLoading = state.fetchedDate !== targetDate

  return { data: state.data, isLoading, error: state.error }
}
