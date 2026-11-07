'use client'

import { useState, useEffect } from 'react'
import type { GuestInfoData } from '@/application/guestInfo/getGuestInfoUseCase'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { httpErrorMessage } from '@/hooks/httpErrorMessage'

type State = {
  data: GuestInfoData | null
  stateKey: string | null
  loadedDate: string | null
  error: string | null
}

// 予約カードのデータ。日付を切り替えるたび・refreshKey が変わるたびに必ず取り直す（キャッシュはしない）。
// - isLoading: 今の日付のデータがない（前の日のデータは返さない。画面は仮の表示にする）
// - isRefreshing: 今の日付のデータはあるが取り直し中（閉じる・追加・キャンセルの後）。画面は薄く出して操作を止める
// 返すデータは、どちらでもないときだけ最新
export function useGuestInfo(targetDate: string, refreshKey = 0) {
  // 日付・refreshKey が変わるたびに番号を振る（訪問）。A → B → A と戻ったときも、戻った A を取り直し中として扱う。
  // 番号がないと、戻った瞬間に前の A の取得が「今の取得」に見え、古いデータを最新として出していた
  const [visit, setVisit] = useState({ date: targetDate, refreshKey, n: 0 })
  if (visit.date !== targetDate || visit.refreshKey !== refreshKey) {
    setVisit({ date: targetDate, refreshKey, n: visit.n + 1 })
  }
  const stateKey = `${targetDate}-${refreshKey}-${visit.n}`

  const [state, setState] = useState<State>({
    data: null,
    stateKey: null,
    loadedDate: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetchWithSession(`/api/guest-info?date=${targetDate}`)
        if (cancelled) return
        if (!res.ok) {
          const message =
            httpErrorMessage(res.status, 'fetch', 'データの取得に失敗しました。管理者に通知済みです。')
          setState({ data: null, stateKey, loadedDate: targetDate, error: message })
          return
        }
        const data = (await res.json()) as GuestInfoData
        if (!cancelled) setState({ data, stateKey, loadedDate: targetDate, error: null })
      } catch {
        if (!cancelled)
          setState({
            data: null,
            stateKey,
            loadedDate: targetDate,
            error: '通信エラーが発生しました。ネットワーク接続を確認してください',
          })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // stateKey は targetDate・refreshKey から決まる（訪問の番号は同じレンダーで振り直される）
  }, [targetDate, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrent = state.stateKey === stateKey
  const hasDataForDate = state.loadedDate === targetDate && state.data !== null
  const isLoading = !isCurrent && !hasDataForDate
  const isRefreshing = !isCurrent && hasDataForDate

  return {
    data: isLoading ? null : state.data,
    isLoading,
    isRefreshing,
    error: isCurrent ? state.error : null,
    loadedKey: state.stateKey,
    loadedDate: state.loadedDate,
  }
}
