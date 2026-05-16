'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DailyTodo } from '@/domain/ports/dailyRepository'

type State = {
  todos: DailyTodo[]
  fetchedDate: string | null
  error: string | null
}

async function saveTodos(date: string, todos: DailyTodo[]): Promise<void> {
  await fetch(`/api/daily/${date}/todos`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos }),
  })
}

export function useDailyTodos(date: string) {
  const [state, setState] = useState<State>({ todos: [], fetchedDate: null, error: null })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`/api/daily/${date}/todos`)
        if (cancelled) return
        if (!res.ok) {
          setState({ todos: [], fetchedDate: date, error: 'データの取得に失敗しました' })
          return
        }
        const json = (await res.json()) as { todos: DailyTodo[] }
        if (!cancelled) setState({ todos: json.todos, fetchedDate: date, error: null })
      } catch {
        if (!cancelled) setState({ todos: [], fetchedDate: date, error: '通信エラーが発生しました' })
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
        void saveTodos(date, updated)
        return { ...prev, todos: updated }
      })
    },
    [date],
  )

  const removeTodo = useCallback(
    async (id: string) => {
      setState((prev) => {
        const updated = prev.todos.filter((t) => t.id !== id)
        void saveTodos(date, updated)
        return { ...prev, todos: updated }
      })
    },
    [date],
  )

  const isLoading = state.fetchedDate !== date

  return { todos: state.todos, isLoading, error: state.error, addTodo, removeTodo }
}
