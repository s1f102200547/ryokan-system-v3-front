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
    // setState は useEffect 内で呼ぶとそのたびに無駄に再レンダリングされてバグの原因&パフォーマンス低下になりうるので外で呼ぶ
    fetch(`/api/cleaning-board?date=${targetDate}`) // 2. データを取りにいく（fetch）
      .then((res) => {
        if (!res.ok) throw new Error('データの取得に失敗しました')
        return res.json() as Promise<CleaningBoardData>
      })
      .then((data) => setState({ data, fetchedDate: targetDate, error: null })) // 3. 成功 or 失敗でstate更新
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : '通信エラーが発生しました'
        setState({ data: null, fetchedDate: targetDate, error: message }) // // 3. 成功 or 失敗でstate更新
      })
  }, [targetDate]) // 1. targetDate が変わったら実行

  const isLoading = state.fetchedDate !== targetDate // 3. 成功 or 失敗でstate更新 でどっちにしてもfetchedDateはセットされる

  return { data: state.data, isLoading, error: state.error }
}
