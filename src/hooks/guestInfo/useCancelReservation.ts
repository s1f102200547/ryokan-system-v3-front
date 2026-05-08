'use client'

import { useState, useCallback } from 'react'

type CancelInput = {
  id: string
  staffName: string
  targetDate: string // YYYY-MM-DD
  reason: string
}

export function useCancelReservation() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (input: CancelInput): Promise<boolean> => {
    setIsPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/reservations/${input.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_name: input.staffName,
          target_date: input.targetDate,
          reason: input.reason,
        }),
      })
      if (!res.ok) {
        setError(
          res.status === 503
            ? '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'
            : 'キャンセルに失敗しました。管理者に通知済みです。',
        )
        return false
      }
      return true
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
      return false
    } finally {
      setIsPending(false)
    }
  }, [])

  return { execute, isPending, error }
}
