'use client'

import { useState, useEffect } from 'react'
import type { CleaningBoardData } from '@/types/cleaningBoard'

type State = {
  data: CleaningBoardData | null
  fetchedDate: string | null // 実際に取得済みの日付
  error: string | null
}

// Route Handler 経由で CleaningBoard データを取得する
// application 層を直接呼ばない（Firestore admin はサーバーサイドのみ実行可能）
export function useCleaningBoard(targetDate: string) {
  // YYYY-MM-DD
  const [state, setState] = useState<State>({
    data: null,  // API(->infra->db)から取ってきたデータ
    fetchedDate: null, // uiで指定された日付
    error: null, // data取得に失敗したらセットする
  })

  useEffect(() => {
    let cancelled = false // targetDate が変わった場合に古い fetch の結果を無視する

    const load = async () => {
      try {
        const res = await fetch(`/api/cleaning-board?date=${targetDate}`) // 2. データを取りにいく（fetch）
        if (cancelled) return
        if (!res.ok) {
          const message = res.status === 503
            ? '一時的に通信に失敗しました。しばらく待ってから再度お試しください。' // 一時的なサーバ不調
            : 'データの取得に失敗しました。管理者に通知済みです。'                // サーバ側の一般エラー
          setState({ data: null, fetchedDate: targetDate, error: message })
          return
        }
        const data = await res.json() as CleaningBoardData
        if (!cancelled) setState({ data, fetchedDate: targetDate, error: null }) // 3. 成功 or 失敗でstate更新
      } catch {
        if (!cancelled) setState({ data: null, fetchedDate: targetDate,
          error: '通信エラーが発生しました。ネットワーク接続を確認してください' })    // fetch自体が失敗でレスポンスすら無い
      }
    }

    void load()
    return () => { cancelled = true }
  }, [targetDate]) // 1. targetDate が変わったら実行

  const isLoading = state.fetchedDate !== targetDate // 3. 成功 or 失敗でstate更新 でどっちにしてもfetchedDateはセットされる

  return { data: state.data, isLoading, error: state.error }
}
