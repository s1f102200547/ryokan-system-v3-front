'use client'

import { useState, useCallback } from 'react'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { httpErrorMessage } from '@/hooks/httpErrorMessage'

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
      const res = await fetchWithSession(`/api/reservations/${input.id}/cancel`, {
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
          // 409: すでにその状態（古い画面からの操作など）
          res.status === 409
            ? 'すでにキャンセル済みです。画面を再読み込みしてください。'
            : httpErrorMessage(res.status, 'save', 'キャンセルに失敗しました。管理者に通知済みです。'),
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
