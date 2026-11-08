'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DailyTodo } from '@/domain/ports/dailyRepository'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'

// todos は fetchedDate の日のもの。保存中・保存の失敗も、どの日の保存かを持つ。
// 保存中に日付を切り替えると、前の日の保存の結果が今の日の画面に入り、
// そのまま追加すると前の日の todo ごと今の日に保存していた
type State = {
  todos: DailyTodo[]
  fetchedDate: string | null
  error: string | null
  savingDate: string | null
  saveError: { date: string; message: string } | null
}

async function saveTodos(date: string, todos: DailyTodo[]): Promise<void> {
  const res = await fetchWithSession(`/api/daily/${date}/todos`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos }),
  })
  if (!res.ok) throw new Error('save failed')
}

export function useDailyTodos(date: string) {
  const [state, setState] = useState<State>({
    todos: [],
    fetchedDate: null,
    error: null,
    savingDate: null,
    saveError: null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetchWithSession(`/api/daily/${date}/todos`)
        if (cancelled) return
        if (!res.ok) {
          setState((prev) => ({ ...prev, todos: [], fetchedDate: date, error: 'データの取得に失敗しました' }))
          return
        }
        const json = (await res.json()) as { todos: DailyTodo[] }
        if (!cancelled) setState((prev) => ({ ...prev, todos: json.todos, fetchedDate: date, error: null }))
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, todos: [], fetchedDate: date, error: '通信エラーが発生しました' }))
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [date])

  // 一覧全体を date の日に保存する。結果は、そのとき画面に出ている日が date のときだけ反映する
  const save = useCallback(async (updated: DailyTodo[]) => {
    setState((prev) => ({ ...prev, savingDate: date, saveError: null }))
    try {
      await saveTodos(date, updated)
      setState((prev) => ({
        ...prev,
        todos: prev.fetchedDate === date ? updated : prev.todos,
        savingDate: prev.savingDate === date ? null : prev.savingDate,
      }))
    } catch {
      setState((prev) => ({
        ...prev,
        savingDate: prev.savingDate === date ? null : prev.savingDate,
        saveError: { date, message: '保存に失敗しました' },
      }))
    }
  }, [date])

  const addTodo = useCallback(
    async (text: string) => {
      const newTodo: DailyTodo = { id: crypto.randomUUID(), text }
      await save([...state.todos, newTodo])
    },
    [save, state.todos],
  )

  const removeTodo = useCallback(
    async (id: string) => {
      await save(state.todos.filter((t) => t.id !== id))
    },
    [save, state.todos],
  )

  const isLoading = state.fetchedDate !== date

  return {
    todos: state.todos,
    isLoading,
    error: state.error,
    isSaving: state.savingDate === date,
    saveError: state.saveError?.date === date ? state.saveError.message : null,
    addTodo,
    removeTodo,
  }
}
