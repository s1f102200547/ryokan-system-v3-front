'use client'

import { useState, useCallback } from 'react'

export function useUpdateSafeBalanceChecker() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (date: string, staffName: string): Promise<void> => {
    setIsPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/daily/${date}/safe-balance-checker`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName }),
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
