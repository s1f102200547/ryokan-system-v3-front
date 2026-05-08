'use client'

import { useState, useEffect } from 'react'
import type { GuestInfoData } from '@/application/guestInfo/getGuestInfoUseCase'

type State = {
  data: GuestInfoData | null
  stateKey: string | null
  error: string | null
}

export function useGuestInfo(targetDate: string, refreshKey = 0) {
  const stateKey = `${targetDate}-${refreshKey}`

  const [state, setState] = useState<State>({
    data: null,
    stateKey: null,
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
          setState({ data: null, stateKey, error: message })
          return
        }
        const data = (await res.json()) as GuestInfoData
        if (!cancelled) setState({ data, stateKey, error: null })
      } catch {
        if (!cancelled)
          setState({
            data: null,
            stateKey,
            error: '通信エラーが発生しました。ネットワーク接続を確認してください',
          })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [targetDate, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLoading = state.stateKey !== stateKey

  return { data: state.data, isLoading, error: state.error, loadedKey: state.stateKey }
}
