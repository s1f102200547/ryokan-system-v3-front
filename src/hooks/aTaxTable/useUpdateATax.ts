'use client'

import { useState, useCallback } from 'react'
import type { ATaxPatch } from '@/types/guestInfo'

export function useUpdateATax() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (id: string, patch: ATaxPatch): Promise<void> => {
    setIsPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/reservations/${id}/a-tax`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        setError(
          res.status === 503
            ? '一時的に通信に失敗しました。しばらく待ってから再度お試しください。'
            : '保存に失敗しました。管理者に通知済みです。',
        )
      }
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
    } finally {
      setIsPending(false)
    }
  }, [])

  return { execute, isPending, error }
}
