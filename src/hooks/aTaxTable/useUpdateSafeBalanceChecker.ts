'use client'

import { useState, useCallback } from 'react'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { httpErrorMessage } from '@/hooks/httpErrorMessage'

export function useUpdateSafeBalanceChecker() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async (date: string, staffName: string): Promise<string | null> => {
    setIsPending(true)
    setError(null)
    try {
      const res = await fetchWithSession(`/api/daily/${date}/safe-balance-checker`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName }),
      })
      if (!res.ok) {
        const msg =
          httpErrorMessage(res.status, 'save', '保存に失敗しました。管理者に通知済みです。')
        setError(msg)
        return msg
      }
      return null
    } catch {
      const msg = '通信エラーが発生しました。ネットワーク接続を確認してください'
      setError(msg)
      return msg
    } finally {
      setIsPending(false)
    }
  }, [])

  return { execute, isPending, error }
}
