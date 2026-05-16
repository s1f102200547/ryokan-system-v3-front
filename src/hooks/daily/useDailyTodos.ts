'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DailyTodo } from '@/domain/ports/dailyRepository'

type State = {
  todos: DailyTodo[]
  fetchedDate: string | null
  error: string | null
  isSaving: boolean
  saveError: string | null
}

async function saveTodos(date: string, todos: DailyTodo[]): Promise<void> {
  const res = await fetch(`/api/daily/${date}/todos`, {
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
    isSaving: false,
    saveError: null,
  })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/daily/${date}/todos`)
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

  const addTodo = useCallback(
    async (text: string) => {
      const newTodo: DailyTodo = { id: crypto.randomUUID(), text }
      setState((prev) => {
        const updated = [...prev.todos, newTodo]
        return { ...prev, todos: updated, isSaving: true, saveError: null }
      })
      try {
        await saveTodos(date, [...state.todos, newTodo])
        setState((prev) => ({ ...prev, isSaving: false }))
      } catch {
        setState((prev) => ({ ...prev, isSaving: false, saveError: '保存に失敗しました' }))
      }
    },
    [date, state.todos],
  )

  const removeTodo = useCallback(
    async (id: string) => {
      const updated = state.todos.filter((t) => t.id !== id)
      setState((prev) => ({ ...prev, todos: updated, isSaving: true, saveError: null }))
      try {
        await saveTodos(date, updated)
        setState((prev) => ({ ...prev, isSaving: false }))
      } catch {
        setState((prev) => ({ ...prev, isSaving: false, saveError: '保存に失敗しました' }))
      }
    },
    [date, state.todos],
  )

  const isLoading = state.fetchedDate !== date

  return {
    todos: state.todos,
    isLoading,
    error: state.error,
    isSaving: state.isSaving,
    saveError: state.saveError,
    addTodo,
    removeTodo,
  }
}
