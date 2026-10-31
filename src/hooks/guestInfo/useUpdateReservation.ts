'use client'

import { useState, useCallback } from 'react'
import type { ReservationPatch } from '@/types/guestInfo'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { httpErrorMessage } from '@/hooks/httpErrorMessage'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// 保存の結果。retry は通信エラー・サーバーの障害（送り直せば通る見込みがある）、rejected は入力の誤りなど（送り直しても通らない）
export type SaveResult = 'saved' | 'retry' | 'rejected'

export function useUpdateReservation() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    setError(null)
    setSaveStatus('idle')
  }, [])

  const execute = useCallback(async (id: string, patch: ReservationPatch): Promise<SaveResult> => {
    setSaveStatus('saving')
    setError(null)
    try {
      const res = await fetchWithSession(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const message =
          httpErrorMessage(res.status, 'save', '保存に失敗しました。管理者に通知済みです。')
        setError(message)
        setSaveStatus('error')
        return res.status >= 500 ? 'retry' : 'rejected'
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      return 'saved'
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
      setSaveStatus('error')
      return 'retry'
    }
  }, [])

  return { execute, saveStatus, error, clearError }
}
