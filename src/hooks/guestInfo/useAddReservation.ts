'use client'

import { useState, useCallback } from 'react'
import type { NewReservationInput } from '@/types/guestInfo'

export function useAddReservation() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 成功時は reservation_number を返す。失敗時は null
  const execute = useCallback(async (input: NewReservationInput): Promise<string | null> => {
    setIsPending(true)
    setError(null)
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        setError(
          res.status === 503
            ? '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'
            : '予約の追加に失敗しました。管理者に通知済みです。',
        )
        return null
      }
      const data = (await res.json()) as { reservation_number: string }
      return data.reservation_number
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
      return null
    } finally {
      setIsPending(false)
    }
  }, [])

  return { execute, isPending, error }
}
