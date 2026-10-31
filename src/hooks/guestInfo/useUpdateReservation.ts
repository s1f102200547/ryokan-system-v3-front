'use client'

import { useState, useCallback } from 'react'
import type { ReservationPatch } from '@/types/guestInfo'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { httpErrorMessage } from '@/hooks/httpErrorMessage'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useUpdateReservation() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => {
    setError(null)
    setSaveStatus('idle')
  }, [])

  const execute = useCallback(async (id: string, patch: ReservationPatch): Promise<void> => {
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
        return
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
      setSaveStatus('error')
    }
  }, [])

  return { execute, saveStatus, error, clearError }
}
